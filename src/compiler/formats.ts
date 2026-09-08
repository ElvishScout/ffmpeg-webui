import type { EncodePreset, OutputFormat } from "../types/graph";

/** Which stream kinds a format consumes (drives validation of sink connections). */
export type FormatKind = "av" | "video" | "audio";

export interface FormatSpec {
  kind: FormatKind;
  /** default container extension when the filename lacks one */
  ext: string;
  /** encode strategies that apply on top of the format default; copy = remux */
  presets: EncodePreset[];
  /** strategy-specific codec args (copy handled generically) */
  video?: Partial<Record<EncodePreset, string[]>>;
  audio?: Partial<Record<EncodePreset, string[]>>;
  /** fixed codec args for formats without strategy variants */
  fixedVideo?: string[];
  fixedAudio?: string[];
}

const H264: Partial<Record<EncodePreset, string[]>> = {
  lossless: ["-c:v", "libx264", "-crf", "0", "-preset", "medium", "-pix_fmt", "yuv420p"],
  high: ["-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p"],
  fast: ["-c:v", "libx264", "-crf", "28", "-preset", "ultrafast", "-pix_fmt", "yuv420p"],
};

// VP8, not VP9: libvpx-vp9 is broken in @ffmpeg/core-mt 0.12.10 (hangs, or
// "Failed to allocate new_fb_ptr->mvs"); libvpx (VP8) encodes fine.
const VP8: Partial<Record<EncodePreset, string[]>> = {
  high: ["-c:v", "libvpx", "-crf", "10", "-b:v", "1M", "-pix_fmt", "yuv420p"],
  fast: [
    "-c:v",
    "libvpx",
    "-crf",
    "14",
    "-b:v",
    "700k",
    "-deadline",
    "realtime",
    "-cpu-used",
    "5",
    "-pix_fmt",
    "yuv420p",
  ],
};

const AAC: Partial<Record<EncodePreset, string[]>> = {
  high: ["-c:a", "aac", "-b:a", "192k"],
  fast: ["-c:a", "aac", "-b:a", "128k"],
};

export const FORMATS: Record<OutputFormat, FormatSpec> = {
  mp4: {
    kind: "av",
    ext: "mp4",
    presets: ["lossless", "high", "fast", "copy"],
    video: H264,
    audio: { ...AAC, lossless: ["-c:a", "alac"] },
  },
  mkv: {
    kind: "av",
    ext: "mkv",
    presets: ["lossless", "high", "fast", "copy"],
    video: { ...H264, lossless: ["-c:v", "ffv1"] },
    audio: { ...AAC, lossless: ["-c:a", "flac"] },
  },
  webm: {
    kind: "av",
    ext: "webm",
    // the webm muxer only accepts vp8/vp9/av1 + vorbis/opus, so no lossless tier
    presets: ["high", "fast", "copy"],
    video: VP8,
    audio: {
      high: ["-c:a", "libopus", "-b:a", "128k"],
      fast: ["-c:a", "libopus", "-b:a", "96k"],
    },
  },
  hevc: {
    kind: "av",
    ext: "mp4",
    presets: ["copy"],
    fixedVideo: [
      "-c:v",
      "libx265",
      "-crf",
      "23",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
      "-tag:v",
      "hvc1",
    ],
    fixedAudio: ["-c:a", "aac", "-b:a", "192k"],
  },
  prores: {
    kind: "av",
    ext: "mov",
    presets: ["copy"],
    fixedVideo: ["-c:v", "prores_ks", "-profile:v", "3"],
    fixedAudio: ["-c:a", "pcm_s16le"],
  },
  mp3: {
    kind: "audio",
    ext: "mp3",
    presets: ["copy"],
    fixedAudio: ["-c:a", "libmp3lame", "-q:a", "2"],
  },
  m4a: {
    kind: "audio",
    ext: "m4a",
    presets: ["copy"],
    fixedAudio: ["-c:a", "aac", "-b:a", "192k"],
  },
  flac: {
    kind: "audio",
    ext: "flac",
    presets: ["copy"],
    fixedAudio: ["-c:a", "flac"],
  },
  wav: {
    kind: "audio",
    ext: "wav",
    presets: ["copy"],
    fixedAudio: ["-c:a", "pcm_s16le"],
  },
  opus: {
    kind: "audio",
    ext: "opus",
    presets: ["copy"],
    fixedAudio: ["-c:a", "libopus", "-b:a", "128k"],
  },
  // gif gets a palettegen/paletteuse chain injected by compile.ts, no codec args
  gif: { kind: "video", ext: "gif", presets: [] },
  apng: {
    kind: "video",
    ext: "apng",
    presets: [],
    fixedVideo: ["-c:v", "apng"],
  },
};

/**
 * Effective format of a sink node. Legacy graphs carry only `preset`
 * (lossless/copy implied MKV, high/fast implied MP4) — derive, don't migrate.
 */
export function formatOf(node: { format?: OutputFormat; preset?: EncodePreset }): OutputFormat {
  if (node.format) return node.format;
  const p = node.preset ?? "high";
  return p === "lossless" || p === "copy" ? "mkv" : "mp4";
}

export function formatKind(node: { format?: OutputFormat; preset?: EncodePreset }): FormatKind {
  return FORMATS[formatOf(node)].kind;
}

/** Codec args for a (format, preset) pair. preset undefined = format default. */
export function codecArgs(
  format: OutputFormat,
  preset: EncodePreset | undefined,
): { video: string[]; audio: string[] } {
  if (preset === "copy") return { video: ["-c:v", "copy"], audio: ["-c:a", "copy"] };
  const spec = FORMATS[format];
  const p = preset ?? "high";
  return {
    video: spec.video?.[p] ?? spec.fixedVideo ?? [],
    audio: spec.audio?.[p] ?? spec.fixedAudio ?? [],
  };
}
