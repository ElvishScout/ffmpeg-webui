import type { AssetRef } from "./graph";

/** A single compiled ffmpeg invocation. */
export interface JobSegment {
  /** ffmpeg CLI args (excluding the leading "ffmpeg"). */
  args: string[];
  /** Input files, in the order they appear as -i. */
  inputs: JobInput[];
  /** Files this segment produces. */
  outputs: JobOutput[];
  /** Sum of probed input durations (seconds), for progress estimation. */
  expectedDuration?: number;
}

export interface JobInput {
  /** filename inside the execution environment */
  file: string;
  source: { kind: "asset"; asset: AssetRef } | { kind: "stage"; nodeId: string };
  /** asset input-side options (emitted before -i) */
  inputSS?: string;
  inputT?: string;
  streamLoop?: number;
}

export interface JobOutput {
  file: string;
  nodeId: string;
  kind: "output" | "stage";
}

export interface Job {
  segments: JobSegment[];
  /** nodeId -> human readable label, for UI + downstream backend rewriting. */
  nodeLabels: Record<string, string>;
}

export interface ProducedFile {
  nodeId: string;
  kind: "output" | "stage";
  filename: string;
  data: Uint8Array;
}

export interface ExecEvents {
  onLog?: (line: string) => void;
  onSegmentStart?: (index: number, total: number) => void;
  /** ratio in [0,1] within the current segment */
  onProgress?: (segIndex: number, ratio: number) => void;
  onSegmentDone?: (segIndex: number, outputs: ProducedFile[]) => void;
}
