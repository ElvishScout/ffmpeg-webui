import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ProducedFile } from "../types/job";
import { executors, CancelledError, sabSupported } from "../executor/wasm";
import { useGraphStore } from "./graph";
import { readAssetBytes } from "../data/assets";

export type RunStatus = "idle" | "loading" | "running" | "done" | "failed" | "cancelled";

export const useRunStore = defineStore("run", () => {
  const status = ref<RunStatus>("idle");
  const segmentIndex = ref(0);
  const segmentTotal = ref(0);
  const segmentRatio = ref(0);
  const logs = ref<string[]>([]);
  const outputs = ref<ProducedFile[]>([]);
  const error = ref<string | null>(null);
  const backendId = ref("wasm");

  const graphStore = useGraphStore();

  const executor = computed(() => executors.find((e) => e.id === backendId.value)!);
  const running = computed(() => status.value === "running" || status.value === "loading");

  function pushLog(line: string) {
    logs.value.push(line);
    if (logs.value.length > 2000) logs.value.splice(0, logs.value.length - 2000);
  }

  async function run() {
    const { job, errors } = graphStore.compile();
    if (!job) throw new Error(errors.map((e) => e.code).join(", "));
    if (!sabSupported) throw new Error("SharedArrayBuffer unavailable");

    status.value = "loading";
    logs.value = [];
    outputs.value = [];
    error.value = null;
    segmentIndex.value = 0;
    segmentTotal.value = job.segments.length;
    segmentRatio.value = 0;

    // gather asset bytes
    const assetIds = new Set<string>();
    for (const seg of job.segments)
      for (const input of seg.inputs)
        if (input.source.kind === "asset") assetIds.add(input.source.asset.id);
    const bytes: Record<string, Uint8Array> = {};
    for (const id of assetIds) bytes[id] = await readAssetBytes(id);

    try {
      const result = await executor.value.run(job, bytes, {
        onLog: pushLog,
        onSegmentStart: (i, total) => {
          status.value = "running";
          segmentIndex.value = i;
          segmentTotal.value = total;
          segmentRatio.value = 0;
        },
        onProgress: (_i, ratio) => {
          segmentRatio.value = ratio;
        },
        onSegmentDone: (i, segOut) => {
          outputs.value.push(...segOut);
          segmentIndex.value = i;
          segmentRatio.value = 1;
        },
      });
      status.value = "done";
      return result;
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
  }

  return {
    status,
    segmentIndex,
    segmentTotal,
    segmentRatio,
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
