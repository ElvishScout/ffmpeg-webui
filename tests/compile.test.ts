import { describe, it, expect } from "vitest";
import { compileGraph, jobToCommands, serializeFilter } from "../src/compiler/compile";
import { validateGraph, portsCompatible } from "../src/compiler/validate";
import type { WorkflowGraph, WorkflowNode, WorkflowEdge, AssetRef } from "../src/types/graph";

const asset = (id: string, filename = `${id}.mp4`): AssetRef => ({
  id,
  filename,
  size: 1000,
  mime: "video/mp4",
});

let nid = 0;
function node(partial: Partial<WorkflowNode> & { kind: WorkflowNode["kind"] }): WorkflowNode {
  return {
    id: `n${++nid}`,
    position: { x: 0, y: 0 },
    ...partial,
  } as WorkflowNode;
}
function edge(source: string, sh: string, target: string, th: string): WorkflowEdge {
  return {
    id: `e-${source}-${sh}-${target}-${th}`,
    source,
    sourceHandle: sh,
    target,
    targetHandle: th,
  };
}
function graph(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
  return { schemaVersion: 1, name: "t", nodes, edges };
}

describe("portsCompatible", () => {
  it("av feeds anything, video only video, audio only audio", () => {
    expect(portsCompatible("av", "video")).toBe(true);
    expect(portsCompatible("av", "audio")).toBe(true);
    expect(portsCompatible("video", "video")).toBe(true);
    expect(portsCompatible("video", "audio")).toBe(false);
    expect(portsCompatible("audio", "video")).toBe(false);
  });
});

describe("serializeFilter", () => {
  it("serializes named params and skips empty", () => {
    const n = node({
      kind: "filter",
      filterName: "scale",
      params: { w: "1280", h: "-1", flags: "lanczos" },
    });
    expect(serializeFilter(n)).toBe("scale=w=1280:h=-1:flags=lanczos");
  });
  it("serializes bare filter when no params set", () => {
    const n = node({ kind: "filter", filterName: "hflip", params: {} });
    expect(serializeFilter(n)).toBe("hflip");
  });
  it("escapes special chars", () => {
    const n = node({
      kind: "filter",
      filterName: "drawtext",
      params: { text: "a:b,c" },
    });
    expect(serializeFilter(n)).toBe("drawtext=text=a\\:b\\,c");
  });
  it("escapes # in hex colors (filtergraph comment char)", () => {
    const n = node({
      kind: "source",
      filterName: "color",
      params: { c: "#ff0000", s: "320x240", d: 1 },
    });
    expect(serializeFilter(n)).toBe("color=c=\\#ff0000:s=320x240:d=1");
  });
  it("serializes split positionally", () => {
    const n = node({
      kind: "filter",
      filterName: "split",
      params: { n: 3 },
      outputCount: 3,
    });
    expect(serializeFilter(n)).toBe("split=3");
  });
});

describe("validateGraph", () => {
  it("rejects graph without output", () => {
    const g = graph([node({ kind: "asset", assetRef: asset("a") })], []);
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "noOutput")).toBe(true);
  });
  it("rejects cycles", () => {
    const a = node({ kind: "filter", filterName: "hflip" });
    const b = node({ kind: "filter", filterName: "vflip" });
    const o = node({ kind: "output", filename: "o" });
    const g = graph(
      [a, b, o],
      [
        edge(a.id, "out-0", b.id, "in-0"),
        edge(b.id, "out-0", a.id, "in-0"),
        edge(b.id, "out-0", o.id, "in-0"),
      ],
    );
    const r = validateGraph(g);
    expect(r.errors.some((e) => e.code === "cycle")).toBe(true);
  });
  it("rejects unconnected filter inputs", () => {
    const f = node({ kind: "filter", filterName: "scale" });
    const o = node({ kind: "output", filename: "o" });
    const g = graph([f, o], [edge(f.id, "out-0", o.id, "in-0")]);
    const r = validateGraph(g);
    expect(r.errors.some((e) => e.code === "inputUnconnected")).toBe(true);
  });
  it("rejects missing asset references", () => {
    const a = node({ kind: "asset", assetRef: asset("gone") });
    const o = node({ kind: "output", filename: "o" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    const r = validateGraph(g, { missingAssetIds: new Set(["gone"]) });
    expect(r.errors.some((e) => e.code === "assetMissing")).toBe(true);
  });
  it("accepts a minimal asset -> output graph", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "o" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    expect(validateGraph(g).ok).toBe(true);
  });
});

describe("compileGraph", () => {
  it("compiles direct asset -> output to a single map command", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "out", preset: "high" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    expect(job!.segments).toHaveLength(1);
    const args = job!.segments[0].args;
    expect(args).toContain("-i");
    expect(args).not.toContain("-filter_complex");
    expect(args).toContain("0:v");
    expect(args).toContain("libx264");
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("compiles a filter chain to filter_complex", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const s = node({
      kind: "filter",
      filterName: "scale",
      params: { w: "640", h: "-1" },
    });
    const h = node({ kind: "filter", filterName: "hflip", params: {} });
    const o = node({ kind: "output", filename: "out", preset: "fast" });
    const g = graph(
      [a, s, h, o],
      [
        edge(a.id, "out-0", s.id, "in-0"),
        edge(s.id, "out-0", h.id, "in-0"),
        edge(h.id, "out-0", o.id, "in-0"),
      ],
    );
    const { job } = compileGraph(g);
    const seg = job!.segments[0];
    const fc = seg.args[seg.args.indexOf("-filter_complex") + 1];
    expect(fc).toBe("[0:v]scale=w=640:h=-1[n0];[n0]hflip[n1]");
    expect(seg.args.join(" ")).toContain("-map [n1]");
  });

  it("splits segments at stage nodes and wires the file through", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const s1 = node({ kind: "filter", filterName: "hflip" });
    const mid = node({ kind: "stage", filename: "mid", preset: "lossless" });
    const s2 = node({ kind: "filter", filterName: "vflip" });
    const o = node({ kind: "output", filename: "out", preset: "high" });
    const g = graph(
      [a, s1, mid, s2, o],
      [
        edge(a.id, "out-0", s1.id, "in-0"),
        edge(s1.id, "out-0", mid.id, "in-0"),
        edge(mid.id, "out-0", s2.id, "in-0"),
        edge(s2.id, "out-0", o.id, "in-0"),
      ],
    );
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    expect(job!.segments).toHaveLength(2);
    const [seg0, seg1] = job!.segments;
    expect(seg0.outputs[0]).toMatchObject({
      file: "mid.mkv",
      kind: "stage",
      nodeId: mid.id,
    });
    expect(seg1.inputs[0]).toMatchObject({
      file: "mid.mkv",
      source: { kind: "stage", nodeId: mid.id },
    });
    expect(seg1.args.join(" ")).toContain("-i mid.mkv");
  });

  it("maps both video and audio pads on outputs", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const vol = node({
      kind: "filter",
      filterName: "volume",
      params: { volume: "0.5" },
    });
    const o = node({ kind: "output", filename: "out", preset: "high" });
    const g = graph(
      [a, vol, o],
      [
        edge(a.id, "out-0", o.id, "in-0"),
        edge(a.id, "out-0", vol.id, "in-0"),
        edge(vol.id, "out-0", o.id, "in-1"),
      ],
    );
    const { job } = compileGraph(g);
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-map 0:v");
    expect(args).toContain("volume=volume=0.5");
    expect(args).toContain("aac");
  });

  it("expands concat input pads from the n param", () => {
    const a = node({ kind: "asset", assetRef: asset("a", "a.mp4") });
    const b = node({ kind: "asset", assetRef: asset("b", "b.mp4") });
    const c = node({
      kind: "filter",
      filterName: "concat",
      params: { n: 2, v: 1, a: 0 },
      inputCount: 2,
    });
    const o = node({ kind: "output", filename: "out" });
    const g = graph(
      [a, b, c, o],
      [
        edge(a.id, "out-0", c.id, "in-0"),
        edge(b.id, "out-0", c.id, "in-1"),
        edge(c.id, "out-0", o.id, "in-0"),
      ],
    );
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const seg = job!.segments[0];
    expect(seg.inputs).toHaveLength(2);
    const fc = seg.args[seg.args.indexOf("-filter_complex") + 1];
    expect(fc).toMatch(/^\[0:v\]\[1:v\]concat=n=2:v=1:a=0\[n\d\]$/);
  });

  it("keeps image-only outputs single-frame (a loop would never terminate)", () => {
    const a = node({
      kind: "asset",
      assetRef: { id: "img", filename: "p.png", size: 1, mime: "image/png" },
    });
    const o = node({ kind: "output", filename: "out" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    const { job } = compileGraph(g);
    const args = job!.segments[0].args.join(" ");
    expect(args).not.toContain("-loop");
    expect(args).not.toContain("-shortest");
    expect(args).toContain("-i in0.png");
  });

  it("loops images bounded by a finite input and adds -shortest", () => {
    const img = node({
      kind: "asset",
      assetRef: { id: "img", filename: "p.png", size: 1, mime: "image/png" },
    });
    const au = node({
      kind: "asset",
      assetRef: { id: "au", filename: "a.mp3", size: 1, mime: "audio/mpeg" },
    });
    const o = node({ kind: "output", filename: "out" });
    const g = graph(
      [img, au, o],
      [edge(img.id, "out-0", o.id, "in-0"), edge(au.id, "out-0", o.id, "in-1")],
    );
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-loop 1 -framerate 30 -i in0.png");
    expect(args).toContain("-shortest");
  });

  it("does not add -loop for animated images (gif demuxer rejects it)", () => {
    const a = node({
      kind: "asset",
      assetRef: { id: "g", filename: "anim.gif", size: 1, mime: "image/gif" },
    });
    const o = node({ kind: "output", filename: "out" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    const { job } = compileGraph(g);
    const args = job!.segments[0].args.join(" ");
    expect(args).not.toContain("-loop");
    expect(args).not.toContain("-framerate");
    expect(args).toContain("-i in0.gif");
  });

  it("emits asset input options before -i", () => {
    const a = node({
      kind: "asset",
      assetRef: asset("a"),
      inputSS: "10",
      inputT: "5",
      streamLoop: 2,
    });
    const o = node({ kind: "output", filename: "out" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    const { job } = compileGraph(g);
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-stream_loop 2 -ss 10 -t 5 -i in0.mp4");
  });

  it("selects streams by index on the asset node", () => {
    const a = node({
      kind: "asset",
      assetRef: asset("a"),
      vStream: 1,
      aStream: 2,
    });
    const o = node({ kind: "output", filename: "out" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0"), edge(a.id, "out-0", o.id, "in-1")]);
    const { job } = compileGraph(g);
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-map 0:v:1");
    expect(args).toContain("-map 0:a:2");
  });

  it("supports the copy preset", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "out", preset: "copy" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    const { job } = compileGraph(g);
    const args = job!.segments[0].args;
    expect(args.join(" ")).toContain("-c:v copy");
    expect(args[args.length - 1]).toBe("out.mkv");
  });

  it("maps multiple audio pads on outputs", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const b = node({ kind: "asset", assetRef: asset("b", "b.mp3") });
    (b.assetRef as AssetRef).mime = "audio/mpeg";
    const o = node({ kind: "output", filename: "out", audioPads: 2 });
    const g = graph(
      [a, b, o],
      [
        edge(a.id, "out-0", o.id, "in-0"),
        edge(a.id, "out-0", o.id, "in-1"),
        edge(b.id, "out-0", o.id, "in-2"),
      ],
    );
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-map 0:v");
    expect(args).toContain("-map 0:a");
    expect(args).toContain("-map 1:a");
  });

  it("compiles lavfi source nodes as filtergraph sources", () => {
    const s = node({
      kind: "source",
      sourceFilter: "color=c=red:s=320x240:d=1",
      sourceOutputs: ["video"],
    });
    const f = node({ kind: "filter", filterName: "hflip" });
    const o = node({ kind: "output", filename: "out" });
    const g = graph(
      [s, f, o],
      [edge(s.id, "out-0", f.id, "in-0"), edge(f.id, "out-0", o.id, "in-0")],
    );
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const seg = job!.segments[0];
    expect(seg.inputs).toHaveLength(0);
    const fc = seg.args[seg.args.indexOf("-filter_complex") + 1];
    expect(fc).toBe("color=c=red:s=320x240:d=1[n0];[n0]hflip[n1]");
  });

  it("rejects empty source expressions", () => {
    const s = node({
      kind: "source",
      sourceFilter: "",
      sourceOutputs: ["video"],
    });
    const o = node({ kind: "output", filename: "out" });
    const g = graph([s, o], [edge(s.id, "out-0", o.id, "in-0")]);
    const { errors } = compileGraph(g);
    expect(errors.some((e) => e.code === "sourceEmpty")).toBe(true);
  });

  it("renders commands with quoted filtergraph", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const f = node({ kind: "filter", filterName: "hflip" });
    const o = node({ kind: "output", filename: "out" });
    const g = graph(
      [a, f, o],
      [edge(a.id, "out-0", f.id, "in-0"), edge(f.id, "out-0", o.id, "in-0")],
    );
    const { job } = compileGraph(g);
    const [cmd] = jobToCommands(job!);
    expect(cmd).toMatch(/^ffmpeg -y -i in0\.mp4 -filter_complex '.+' .+ out\.mp4$/);
  });
});

describe("output formats", () => {
  const lastArg = (job: NonNullable<ReturnType<typeof compileGraph>["job"]>, seg = 0) =>
    job.segments[seg].args[job.segments[seg].args.length - 1];

  it("webm defaults to vp8 + opus, .webm ext", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "out", format: "webm" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0"), edge(a.id, "out-0", o.id, "in-1")]);
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-c:v libvpx -crf 10 -b:v 1M");
    expect(args).toContain("-c:a libopus -b:a 128k");
    expect(lastArg(job!)).toBe("out.webm");
  });

  it("copy strategy remuxes on any container (webm, m4a)", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const w = node({
      kind: "output",
      filename: "v",
      format: "webm",
      preset: "copy",
    });
    const m = node({
      kind: "output",
      filename: "a",
      format: "m4a",
      preset: "copy",
    });
    const g = graph(
      [a, w, m],
      [
        edge(a.id, "out-0", w.id, "in-0"),
        edge(a.id, "out-0", w.id, "in-1"),
        edge(a.id, "out-0", m.id, "in-1"),
      ],
    );
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-c:v copy");
    expect(args).toContain("-c:a copy");
    expect(args).toContain("v.webm");
    expect(args).toContain("a.m4a");
  });

  it("rejects a strategy the format does not support (lossless on webm)", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({
      kind: "output",
      filename: "out",
      format: "webm",
      preset: "lossless",
    });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    const { errors } = compileGraph(g);
    expect(errors.some((e) => e.code === "presetUnsupported")).toBe(true);
  });

  it("hevc: libx265 with hvc1 tag, mp4 ext", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "out", format: "hevc" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-c:v libx265");
    expect(args).toContain("-tag:v hvc1");
    expect(lastArg(job!)).toBe("out.mp4");
  });

  it("prores: prores_ks + pcm in mov", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "out", format: "prores" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0"), edge(a.id, "out-0", o.id, "in-1")]);
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-c:v prores_ks -profile:v 3");
    expect(args).toContain("-c:a pcm_s16le");
    expect(lastArg(job!)).toBe("out.mov");
  });

  it("mp3: maps only audio, no video codec args", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "out", format: "mp3" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-1")]);
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-map 0:a");
    expect(args).not.toContain("-c:v");
    expect(args).toContain("-c:a libmp3lame -q:a 2");
    expect(lastArg(job!)).toBe("out.mp3");
  });

  it("flac: lossless audio ext", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "out", format: "flac" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-1")]);
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    expect(job!.segments[0].args.join(" ")).toContain("-c:a flac");
    expect(lastArg(job!)).toBe("out.flac");
  });

  it("audio format rejects a connected video pad", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "out", format: "mp3" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    const { errors } = compileGraph(g);
    expect(errors.some((e) => e.code === "presetAudioOnly")).toBe(true);
  });

  it("gif: injects palette chain and maps its output", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "out", format: "gif" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const args = job!.segments[0].args;
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toMatch(
      /^\[0:v\]fps=15,scale=480:-1:flags=lanczos,split\[n\d+\]\[n\d+\];\[n\d+\]palettegen\[n\d+\];\[n\d+\]\[n\d+\]paletteuse\[n(\d+)\]$/,
    );
    const out = fc.match(/paletteuse\[(n\d+)\]$/)![1];
    expect(args.join(" ")).toContain(`-map [${out}]`);
    expect(args[args.length - 1]).toBe("out.gif");
  });

  it("gif: honors gifFps/gifWidth and works downstream of a filter", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const f = node({ kind: "filter", filterName: "hflip" });
    const o = node({
      kind: "output",
      filename: "anim",
      format: "gif",
      gifFps: 10,
      gifWidth: 320,
    });
    const g = graph(
      [a, f, o],
      [edge(a.id, "out-0", f.id, "in-0"), edge(f.id, "out-0", o.id, "in-0")],
    );
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const args = job!.segments[0].args;
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("fps=10,scale=320:-1:flags=lanczos,split");
    // palette chain consumes the hflip label, not a raw input
    expect(fc).toMatch(/\[n\d+\]fps=10,scale=320/);
  });

  it("gif format rejects a connected audio pad", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "out", format: "gif" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0"), edge(a.id, "out-0", o.id, "in-1")]);
    const { errors } = compileGraph(g);
    expect(errors.some((e) => e.code === "presetVideoOnly")).toBe(true);
  });

  it("apng: -c:v apng with .apng ext", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const o = node({ kind: "output", filename: "out", format: "apng" });
    const g = graph([a, o], [edge(a.id, "out-0", o.id, "in-0")]);
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    expect(job!.segments[0].args.join(" ")).toContain("-c:v apng");
    expect(lastArg(job!)).toBe("out.apng");
  });

  it("legacy graphs: preset without format derives the container", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const lo = node({ kind: "output", filename: "lo", preset: "lossless" });
    const hi = node({ kind: "output", filename: "hi", preset: "high" });
    const g = graph(
      [a, lo, hi],
      [
        edge(a.id, "out-0", lo.id, "in-0"),
        edge(a.id, "out-0", lo.id, "in-1"),
        edge(a.id, "out-0", hi.id, "in-0"),
        edge(a.id, "out-0", hi.id, "in-1"),
      ],
    );
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-c:v ffv1");
    expect(args).toContain("-c:a flac");
    expect(args).toContain("lo.mkv");
    expect(args).toContain("hi.mp4");
  });

  it("stage nodes accept the new formats and name mid files accordingly", () => {
    const a = node({ kind: "asset", assetRef: asset("a") });
    const s = node({ kind: "stage", filename: "mid", format: "webm" });
    const o = node({ kind: "output", filename: "out", format: "mp3" });
    const g = graph(
      [a, s, o],
      [edge(a.id, "out-0", s.id, "in-0"), edge(s.id, "out-0", o.id, "in-1")],
    );
    const { job, errors } = compileGraph(g);
    expect(errors).toEqual([]);
    expect(job!.segments).toHaveLength(2);
    expect(lastArg(job!)).toBe("mid.webm");
    // segment 2 reads the webm mid file and emits mp3
    expect(job!.segments[1].inputs[0].file).toBe("mid.webm");
    expect(lastArg(job!, 1)).toBe("out.mp3");
  });
});
