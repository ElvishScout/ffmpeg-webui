import coreURLumd from "../../node_modules/@ffmpeg/core-mt/dist/umd/ffmpeg-core.js?url";
import wasmURLraw from "../../node_modules/@ffmpeg/core-mt/dist/umd/ffmpeg-core.wasm?url";
import workerURLumd from "../../node_modules/@ffmpeg/core-mt/dist/umd/ffmpeg-core.worker.js?url";
import type { Executor } from "../types/executor";
import type { Job, ExecEvents, ProducedFile } from "../types/job";

// Why not @ffmpeg/ffmpeg's wrapper: its worker is hardcoded type:"module",
// forcing coreURL to be an ESM module — but emscripten pthreads are always
// classic workers and importScripts(coreURL), so the core must also be a
// classic script. One URL cannot be both. We therefore skip the wrapper and
// drive the UMD core from our own classic worker, loaded from a Blob.

export const sabSupported =
  typeof SharedArrayBuffer !== "undefined" &&
  typeof crossOriginIsolated !== "undefined" &&
  crossOriginIsolated;

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
  }
}

/**
 * The classic wrapper worker main. Runs in worker scope, created from a
 * Blob — must stay closure-free and self-contained.
 */
function workerMain() {
  const scope = self as unknown as {
    onmessage: (e: MessageEvent) => void;
    postMessage: (msg: unknown, transfer?: Transferable[]) => void;
    importScripts: (url: string) => void;
    createFFmpegCore: (opts: { mainScriptUrlOrBlob: string }) => Promise<CoreModule>;
  };
  // subset of the emscripten Module surface we use
  interface CoreModule {
    exec: (...args: string[]) => void;
    ret: number;
    reset: () => void;
    setLogger: (fn: (d: { message: string }) => void) => void;
    setProgress: (fn: (d: { progress: number; time: number }) => void) => void;
    FS: {
      writeFile: (path: string, data: Uint8Array) => void;
      readFile: (path: string) => Uint8Array;
      unlink: (path: string) => void;
    };
  }
  let ffmpeg: CoreModule | null = null;
  scope.onmessage = async (e: MessageEvent) => {
    const { type } = e.data;
    try {
      if (type === "load") {
        const { coreURL, wasmURL, workerURL } = e.data;
        scope.importScripts(coreURL); // UMD: top-level var becomes global
        ffmpeg = await scope.createFFmpegCore({
          // hash hack: the core's locateFile reads wasm/worker URLs from here
          mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL }))}`,
        });
        ffmpeg.setLogger((d) => scope.postMessage({ type: "log", message: d.message }));
        ffmpeg.setProgress((d) => scope.postMessage({ type: "progress", progress: d.progress }));
        scope.postMessage({ type: "done", op: "load" });
      } else if (type === "exec") {
        ffmpeg!.exec(...e.data.args);
        const code = ffmpeg!.ret;
        ffmpeg!.reset();
        scope.postMessage({ type: "done", op: "exec", code });
      } else if (type === "write") {
        ffmpeg!.FS.writeFile(e.data.path, e.data.data);
        scope.postMessage({ type: "done", op: "write" });
      } else if (type === "read") {
        const data = ffmpeg!.FS.readFile(e.data.path);
        scope.postMessage({ type: "done", op: "read", data }, [data.buffer]);
      } else if (type === "delete") {
        try {
          ffmpeg!.FS.unlink(e.data.path);
        } catch {
          /* already gone */
        }
        scope.postMessage({ type: "done", op: "delete" });
      }
    } catch (err) {
      scope.postMessage({ type: "error", message: String(err) });
    }
  };
}

async function toBlobURL(url: string, mime: string): Promise<string> {
  const buf = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`failed to fetch ${url}: ${r.status}`);
    return r.arrayBuffer();
  });
  return URL.createObjectURL(new Blob([buf], { type: mime }));
}

/** Parse `time=00:00:01.23` from ffmpeg stderr stats lines. */
function parseTimeSeconds(line: string): number | null {
  const t = line.match(/\btime=(\d+):(\d+):([\d.]+)/);
  if (t) return Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]);
  return null;
}

/**
 * core-mt (ffmpeg 5.1.4 / emscripten 3.1.40) deadlocks in libavfilter slice
 * threading: any run that builds a filtergraph — including the implicit simple
 * one inserted for every re-encode — freezes at encoder init. Forcing
 * single-threaded filtergraphs avoids it; decode and x264 stay multithreaded.
 *
 * More encoder-specific core-mt workarounds, verified empirically:
 * - prores_ks / libvpx (VP8): hang with the default 18-thread pool -> -threads 1
 * - libx265: its internal pool ignores -threads; needs -x265-params pools=1
 * Native ffmpeg doesn't need any of this, so it lives here, not in the
 * compiled Job (command preview stays canonical).
 */
function patchArgsForCoreMt(args: string[]): string[] {
  const patch: string[] = [];
  if (!args.includes("-filter_threads")) patch.push("-filter_threads", "1");
  if (!args.includes("-filter_complex_threads")) patch.push("-filter_complex_threads", "1");
  const codecs = new Set(
    args.flatMap((a, i) =>
      (a === "-c:v" || a === "-c:a") && i + 1 < args.length ? [args[i + 1]] : [],
    ),
  );
  if (
    !args.includes("-threads") &&
    (codecs.has("prores_ks") || codecs.has("libvpx") || codecs.has("libvpx-vp9"))
  ) {
    patch.push("-threads", "1");
  }
  if (codecs.has("libx265") && !args.includes("-x265-params"))
    patch.push("-x265-params", "pools=1");
  if (!patch.length) return args;
  const out = [...args];
  out.splice(out.length - 1, 0, ...patch); // before the output filename
  return out;
}

interface CoreWorker {
  call(
    op: string,
    payload?: object,
    transfer?: Transferable[],
  ): Promise<Record<string, never> & { code?: number; data?: Uint8Array }>;
  setHandlers(handlers: {
    onLog?: (m: string) => void;
    onProgress?: (ratio: number) => void;
  }): void;
  terminate(): void;
}

/** Spawn the classic wrapper worker and load the UMD core into it. */
export async function spawnCoreWorker(onLog?: (m: string) => void): Promise<CoreWorker> {
  const [core, wasm, pthread] = await Promise.all([
    toBlobURL(coreURLumd, "text/javascript"),
    toBlobURL(wasmURLraw, "application/wasm"),
    toBlobURL(workerURLumd, "text/javascript"),
  ]);
  const workerURL = URL.createObjectURL(
    new Blob([`(${workerMain.toString()})()`], { type: "text/javascript" }),
  );
  const worker = new Worker(workerURL); // classic worker: importScripts available
  const blobURLs = [core, wasm, pthread, workerURL];

  let handlers: {
    onLog?: (m: string) => void;
    onProgress?: (ratio: number) => void;
  } = {};
  let resolver: ((v: never) => void) | null = null;
  let rejecter: ((e: Error) => void) | null = null;

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === "log") handlers.onLog?.(msg.message);
    else if (msg.type === "progress") handlers.onProgress?.(msg.progress);
    else if (msg.type === "done") {
      resolver?.(msg as never);
      resolver = null;
      rejecter = null;
    } else if (msg.type === "error") {
      rejecter?.(new Error(msg.message));
      resolver = null;
      rejecter = null;
    }
  };
  worker.onerror = (e) => {
    rejecter?.(new Error(e.message));
    resolver = null;
    rejecter = null;
  };

  const api: CoreWorker = {
    call(op, payload = {}, transfer = []) {
      return new Promise((resolve, reject) => {
        resolver = resolve as never;
        rejecter = reject;
        worker.postMessage({ type: op, ...payload }, transfer);
      });
    },
    setHandlers(h) {
      handlers = h;
    },
    terminate() {
      worker.terminate();
      // settle any in-flight call, or the executor's await hangs forever and
      // the run store never learns about the cancellation
      rejecter?.(new CancelledError());
      resolver = null;
      rejecter = null;
      for (const u of blobURLs) URL.revokeObjectURL(u);
    },
  };
  await api.call("load", { coreURL: core, wasmURL: wasm, workerURL: pthread });
  onLog?.("[wasm] core loaded");
  return api;
}

/**
 * ffmpeg-wasm multi-thread executor. The UMD core (~30MB) loads lazily on
 * first run. terminate() destroys the worker; it is rebuilt on demand.
 */
export class WasmExecutor implements Executor {
  readonly id = "wasm";
  readonly label = "ffmpeg-wasm (browser)";
  private core: CoreWorker | null = null;
  private loading: Promise<CoreWorker> | null = null;
  running = false;
  private cancelled = false;

  private async ensure(events: ExecEvents): Promise<CoreWorker> {
    if (this.core) return this.core;
    if (!this.loading) {
      events.onLog?.("[wasm] loading @ffmpeg/core-mt (~30MB)…");
      this.loading = spawnCoreWorker(events.onLog).then((w) => {
        this.core = w;
        return w;
      });
    }
    return this.loading;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.core) {
      this.core.terminate();
      this.core = null;
      this.loading = null;
    }
  }

  async run(
    job: Job,
    assets: Record<string, Uint8Array>,
    events: ExecEvents,
  ): Promise<ProducedFile[]> {
    if (this.running) throw new Error("executor busy");
    this.cancelled = false;
    const core = await this.ensure(events);
    this.running = true;
    const produced: ProducedFile[] = [];

    core.setHandlers({ onLog: events.onLog });

    try {
      for (let s = 0; s < job.segments.length; s++) {
        if (this.cancelled) throw new CancelledError();
        const seg = job.segments[s];
        events.onSegmentStart?.(s, job.segments.length);

        // materialize inputs
        for (const input of seg.inputs) {
          let bytes: Uint8Array;
          if (input.source.kind === "asset") {
            bytes = assets[input.source.asset.id];
            if (!bytes) throw new Error(`missing bytes for asset ${input.source.asset.filename}`);
          } else {
            const prev = produced.find(
              (p) => p.kind === "stage" && p.nodeId === (input.source as { nodeId: string }).nodeId,
            );
            if (!prev)
              throw new Error(
                `stage output missing for node ${(input.source as { nodeId: string }).nodeId}`,
              );
            bytes = prev.data;
          }
          await core.call("write", { path: input.file, data: bytes }, [bytes.buffer]);
        }

        // progress: prefer core progress events, fall back to stderr time=
        core.setHandlers({
          onLog: (m) => {
            events.onLog?.(m);
            const t = parseTimeSeconds(m);
            if (t !== null && seg.expectedDuration) {
              events.onProgress?.(s, Math.min(0.99, t / seg.expectedDuration));
            }
          },
          onProgress: (ratio) => {
            if (ratio >= 0 && ratio <= 1) events.onProgress?.(s, Math.min(0.99, ratio));
          },
        });

        const patchedArgs = patchArgsForCoreMt(seg.args);
        if (patchedArgs !== seg.args) {
          events.onLog?.(
            "[wasm] core-mt workaround: forced -filter_threads 1 -filter_complex_threads 1 (filtergraph MT deadlocks)",
          );
        }
        const res = await core.call("exec", { args: patchedArgs });
        if (this.cancelled) throw new CancelledError();
        if (res.code !== 0)
          throw new Error(`ffmpeg exited with code ${res.code} on segment ${s + 1}`);

        // harvest outputs
        const segOut: ProducedFile[] = [];
        for (const out of seg.outputs) {
          const res2 = await core.call("read", { path: out.file });
          const file: ProducedFile = {
            nodeId: out.nodeId,
            kind: out.kind,
            filename: out.file,
            data: res2.data!,
          };
          produced.push(file);
          segOut.push(file);
          await core.call("delete", { path: out.file });
        }
        // free inputs to keep memory bounded
        for (const input of seg.inputs) await core.call("delete", { path: input.file });
        events.onProgress?.(s, 1);
        events.onSegmentDone?.(s, segOut);
      }
      return produced.filter((p) => p.kind === "output");
    } finally {
      core.setHandlers({});
      this.running = false;
    }
  }
}

export const executors: Executor[] = [new WasmExecutor()];
