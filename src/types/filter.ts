export type LocalText = { zh: string; en: string };

/** Stream type carried by a port. `av` = a media file / container (asset & stage outputs). */
export type PortType = "video" | "audio" | "av";

export interface PortSpec {
  type: PortType;
  /** Optional label shown on the handle (e.g. "main" / "overlay"). */
  label?: LocalText;
}

export type ParamType = "number" | "string" | "boolean" | "select" | "color";

export interface ParamSpec {
  key: string;
  type: ParamType;
  default?: unknown;
  options?: { value: string; label?: LocalText }[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  desc?: LocalText;
}

/**
 * Common base for every node specification: identity + ports + params.
 * Filters, lavfi sources and special nodes (asset/stage/output/raw/…) all
 * share this shape; role-specific specs extend it below.
 */
export interface NodeSpec {
  name: string;
  desc?: LocalText;
  inputs: PortSpec[];
  outputs: PortSpec[];
  params: ParamSpec[];
  /**
   * Name of a numeric param that controls how many input pads the node has
   * (e.g. concat.n, amix.inputs). Node data carries `inputCount`.
   */
  inputsFrom?: string;
  /** Same for output pads (split/asplit). Node data carries `outputCount`. */
  outputsFrom?: string;
}

export interface FilterSpec extends NodeSpec {
  /** ffmpeg filter name, e.g. "scale" */
  name: string;
  category: "transform" | "color" | "overlay" | "audio" | "text" | "io" | "misc";
  /** Serialize the pad-count param positionally (split=2), not as key=value. */
  positionalCount?: boolean;
}
