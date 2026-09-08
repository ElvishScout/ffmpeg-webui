import type { PortType } from "./filter";

export const SCHEMA_VERSION = 1 as const;

/** Reference to an asset. Imported workflows may reference assets not present locally. */
export interface AssetRef {
  id: string;
  filename: string;
  size: number;
  mime: string;
}

export type NodeKind =
  "asset" | "source" | "filter" | "raw" | "stage" | "output" | "upload" | "glob";

export type EncodePreset = "lossless" | "high" | "fast" | "copy";

/** Output container/codec family. Orthogonal to EncodePreset (encode strategy). */
export type OutputFormat =
  // video containers (preset applies)
  | "mp4"
  | "mkv"
  | "webm"
  // video containers with a fixed codec (preset N/A)
  | "hevc"
  | "prores"
  // audio only
  | "mp3"
  | "m4a"
  | "flac"
  | "wav"
  | "opus"
  // animated image (video only)
  | "gif"
  | "apng";

interface NodeBase {
  id: string;
  kind: NodeKind;
  position: { x: number; y: number };
}

/** kind = asset: a media file from the OPFS asset library. */
export interface AssetNode extends NodeBase {
  kind: "asset";
  assetRef: AssetRef;
  /** input-side options (applied before -i) */
  inputSS?: string;
  inputT?: string;
  streamLoop?: number;
  /** which stream of the container to use (default 0) */
  vStream?: number;
  aStream?: number;
}

/** kind = source: lavfi virtual source — spec preset (filterName) or raw expression. */
export interface SourceNode extends NodeBase {
  kind: "source";
  /** SOURCE_PRESETS name (spec-driven params); absent = generic source */
  filterName?: string;
  params?: Record<string, unknown>;
  /** generic source: lavfi source filter, e.g. "color=c=black:s=1280x720:d=5" */
  sourceFilter?: string;
  sourceOutputs?: PortType[];
}

/** kind = filter: an ffmpeg filter from FILTER_REGISTRY. */
export interface FilterNode extends NodeBase {
  kind: "filter";
  /** FILTER_REGISTRY name */
  filterName: string;
  params?: Record<string, unknown>;
  /** dynamic input pad count (filters with inputsFrom) */
  inputCount?: number;
  /** dynamic output pad count (filters with outputsFrom) */
  outputCount?: number;
}

/** kind = raw: arbitrary filter expression with user-declared pads. */
export interface RawNode extends NodeBase {
  kind: "raw";
  rawFilter?: string;
  rawInputs?: PortType[];
  rawOutputs?: PortType[];
}

/** Fields shared by stage & output sinks. */
interface SinkNodeBase extends NodeBase {
  preset?: EncodePreset;
  /** container/codec family; undefined = derived from preset (legacy graphs) */
  format?: OutputFormat;
  filename?: string;
  /** number of audio input pads (default 1, 0 = video only) */
  audioPads?: number;
  /** extra raw ffmpeg output args, e.g. "-movflags +faststart" */
  advancedArgs?: string;
  /** format = gif: frames per second (default 15) */
  gifFps?: number;
  /** format = gif: output width in px, height auto (default 480) */
  gifWidth?: number;
}

export interface StageNode extends SinkNodeBase {
  kind: "stage";
}

export interface OutputNode extends SinkNodeBase {
  kind: "output";
}

/**
 * kind = upload: runtime-collected file batch. Files are picked in a pre-run
 * modal (never stored) and flow through the graph one per iteration.
 */
export interface UploadNode extends NodeBase {
  kind: "upload";
  /** spec params (accept hint) */
  params?: Record<string, unknown>;
  /** input-side options, applied to every file in the stream (before -i) */
  inputSS?: string;
  inputT?: string;
  streamLoop?: number;
  vStream?: number;
  aStream?: number;
}

/**
 * kind = glob: stream-level filename filter (NOT an ffmpeg filter). Passes only
 * files matching `params.patterns`; chained globs AND together.
 */
export interface GlobNode extends NodeBase {
  kind: "glob";
  /** spec params (patterns) */
  params?: Record<string, unknown>;
}

/**
 * Discriminated union over `kind`. The stored/exported JSON shape is unchanged
 * (flat fields, exactly what each variant declares) — no migration needed.
 */
export type WorkflowNode =
  AssetNode | SourceNode | FilterNode | RawNode | StageNode | OutputNode | UploadNode | GlobNode;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Node payload accepted by the graph store before id/position are assigned. */
export type NodeDraft = DistributiveOmit<WorkflowNode, "id" | "position">;

export interface WorkflowEdge {
  id: string;
  source: string;
  /** handle id, e.g. "out-0" */
  sourceHandle: string;
  target: string;
  /** handle id, e.g. "in-0" */
  targetHandle: string;
}

export interface WorkflowGraph {
  schemaVersion: number;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
