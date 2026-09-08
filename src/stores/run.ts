import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Job, ProducedFile } from "../types/job";
import { executors, CancelledError, sabSupported } from "../executor/wasm";
import { useGraphStore } from "./graph";
import { useAssetsStore } from "./assets";
import { readAssetBytes } from "../data/assets";
import { compileGraph } from "../compiler/compile";
import {
  analyzeStreams,
  streamFiles,
  bindIterationGraph,
  syntheticAssetId,
  type UploadedFile,
  type IterationBinding,
} from "../runner/batch";

export type RunStatus = "idle" | "loading" | "running" | "done" | "failed" | "cancelled";

export interface IterationFailure {
  iteration: number;
  files: string[];
  message: string;
}

export const useRunStore = defineStore("run", () => {
  const status = ref<RunStatus>("idle");
  const segmentIndex = ref(0);
  const segmentTotal = ref(0);
  const segmentRatio = ref(0);
  /** batch mode: current iteration (0-based) and total iterations */
  const iterationIndex = ref(0);
  const iterationTotal = ref(0);
  const failures = ref<IterationFailure[]>([]);
  const logs = ref<string[]>([]);
  const outputs = ref<ProducedFile[]>([]);
  const error = ref<string | null>(null);
  const backendId = ref("wasm");

  const graphStore = useGraphStore();
  const assetsStore = useAssetsStore();

  const executor = computed(() => executors.find((e) => e.id === backendId.value)!);
  const running = computed(() => status.value === "running" || status.value === "loading");

  function pushLog(line: string) {
    logs.value.push(line);
    if (logs.value.length > 2000) logs.value.splice(0, logs.value.length - 2000);
  }

  const execEvents = {
    onLog: pushLog,
    onSegmentStart: (i: number, total: number) => {
      status.value = "running";
      segmentIndex.value = i;
      segmentTotal.value = total;
      segmentRatio.value = 0;
    },
    onProgress: (_i: number, ratio: number) => {
      segmentRatio.value = ratio;
    },
    onSegmentDone: (i: number, segOut: ProducedFile[]) => {
      outputs.value.push(...segOut);
      segmentIndex.value = i;
      segmentRatio.value = 1;
    },
  };

  function resetState() {
    status.value = "loading";
    logs.value = [];
    outputs.value = [];
    error.value = null;
    failures.value = [];
    segmentIndex.value = 0;
    segmentTotal.value = 0;
    segmentRatio.value = 0;
    iterationIndex.value = 0;
    iterationTotal.value = 0;
  }

  /** Bytes for every asset input of a job: OPFS for library assets, memory for bound uploads. */
  async function gatherBytes(
    job: Job,
    bindings: IterationBinding[],
  ): Promise<Record<string, Uint8Array>> {
    const bytes: Record<string, Uint8Array> = {};
    for (const seg of job.segments) {
      for (const input of seg.inputs) {
        if (input.source.kind !== "asset") continue;
        const id = input.source.asset.id;
        if (bytes[id]) continue;
        const binding = bindings.find((b) => syntheticAssetId(b.stream.id) === id);
        bytes[id] = binding ? binding.file.data : await readAssetBytes(id);
      }
    }
    return bytes;
  }

  /** Single-shot run: the graph has no upload nodes. */
  async function runSingle(): Promise<ProducedFile[]> {
    const { job, errors } = graphStore.compile();
    if (!job) throw new Error(errors.map((e) => e.code).join(", "));
    const bytes = await gatherBytes(job, []);
    const result = await executor.value.run(job, bytes, execEvents);
    status.value = "done";
    return result;
  }

  /**
   * Batch run: files collected for upload nodes flow through the graph one
   * tuple per iteration. Streams advance in lockstep (natural-sort order);
   * the batch ends when any stream is exhausted. A failed iteration is
   * skipped and summarized at the end.
   */
  async function runBatch(
    streams: ReturnType<typeof analyzeStreams>,
    uploads: Record<string, UploadedFile[]>,
  ): Promise<ProducedFile[]> {
    const graph = graphStore.graph;
    const perStream = streams.map((s) => ({
      stream: s,
      files: streamFiles(s, graph, uploads[s.uploadId] ?? []),
    }));
    for (const { stream, files } of perStream) {
      pushLog(`stream ${stream.id}: ${files.length} file(s) after glob filtering`);
    }
    const total = perStream.length ? Math.min(...perStream.map((x) => x.files.length)) : 0;
    if (total === 0) {
      pushLog("warning: a stream is empty — 0 iterations, no outputs");
      status.value = "done";
      return [];
    }
    iterationTotal.value = total;

    const before = outputs.value.length;
    try {
      for (let i = 0; i < total; i++) {
        iterationIndex.value = i;
        const bindings: IterationBinding[] = perStream.map((x) => ({
          stream: x.stream,
          file: x.files[i],
        }));
        pushLog(
          `── iteration ${i + 1}/${total}: ${bindings.map((b) => b.file.name).join(" + ")} ──`,
        );
        const bound = bindIterationGraph(graph, bindings, String(i + 1).padStart(3, "0"));
        const { job, errors } = compileGraph(bound, {
          assetDurations: assetsStore.durations(),
          missingAssetIds: graphStore.missingAssetIds,
        });
        if (!job) {
          failures.value.push({
            iteration: i + 1,
            files: bindings.map((b) => b.file.name),
            message: errors.map((e) => e.code).join(", "),
          });
          continue;
        }
        try {
          const bytes = await gatherBytes(job, bindings);
          await executor.value.run(job, bytes, execEvents);
        } catch (e) {
          if (e instanceof CancelledError) throw e;
          const message = e instanceof Error ? e.message : String(e);
          pushLog(`iteration ${i + 1} failed: ${message}`);
          failures.value.push({
            iteration: i + 1,
            files: bindings.map((b) => b.file.name),
            message,
          });
        }
      }
    } catch (e) {
      if (e instanceof CancelledError) {
        status.value = "cancelled";
        return outputs.value;
      }
      throw e;
    }

    const produced = outputs.value.length - before;
    pushLog(
      `batch done: ${total - failures.value.length}/${total} iteration(s) ok, ` +
        `${failures.value.length} failed, ${produced} file(s) produced`,
    );
    status.value = "done";
    return outputs.value;
  }

  async function run(uploadFiles?: Record<string, File[]>): Promise<ProducedFile[]> {
    if (!sabSupported) throw new Error("SharedArrayBuffer unavailable");

    const streams = analyzeStreams(graphStore.graph);
    if (streams.length > 0 && !graphStore.validation.ok) {
      throw new Error(graphStore.validation.errors.map((e) => e.code).join(", "));
    }

    resetState();
    try {
      if (streams.length === 0) return await runSingle();
      // read picked files into memory (never persisted)
      const uploads: Record<string, UploadedFile[]> = {};
      for (const [uploadId, files] of Object.entries(uploadFiles ?? {})) {
        uploads[uploadId] = await Promise.all(
          files.map(async (f): Promise<UploadedFile> => ({
            name: f.name,
            mime: f.type,
            data: new Uint8Array(await f.arrayBuffer()),
          })),
        );
      }
      return await runBatch(streams, uploads);
    } catch (e) {
      if (e instanceof CancelledError) status.value = "cancelled";
      else {
        status.value = "failed";
        error.value = e instanceof Error ? e.message : String(e);
      }
      return [];
    }
  }

  function cancel() {
    executor.value.cancel();
  }

  function reset() {
    status.value = "idle";
    outputs.value = [];
    logs.value = [];
    error.value = null;
    failures.value = [];
    iterationIndex.value = 0;
    iterationTotal.value = 0;
  }

  return {
    status,
    segmentIndex,
    segmentTotal,
    segmentRatio,
    iterationIndex,
    iterationTotal,
    failures,
    logs,
    outputs,
    error,
    backendId,
    executor,
    running,
    run,
    cancel,
    reset,
  };
});
