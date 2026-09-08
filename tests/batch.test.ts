import { describe, it, expect } from "vitest";
import {
  analyzeStreams,
  streamFiles,
  matchPatterns,
  naturalCompare,
  suffixFilename,
  bindIterationGraph,
  syntheticAssetId,
  type UploadedFile,
} from "../src/runner/batch";
import { compileGraph } from "../src/compiler/compile";
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  UploadNode,
  GlobNode,
  OutputNode,
} from "../src/types/graph";

let nid = 0;
const id = () => `n${++nid}`;

function upload(extra: Partial<UploadNode> = {}): UploadNode {
  return { kind: "upload", id: id(), position: { x: 0, y: 0 }, params: {}, ...extra };
}
function glob(patterns: string): GlobNode {
  return { kind: "glob", id: id(), position: { x: 0, y: 0 }, params: { patterns } };
}
function output(filename = "out.mp4"): OutputNode {
  return { kind: "output", id: id(), position: { x: 0, y: 0 }, format: "mp4", filename };
}
function edge(source: string, target: string, th = "in-0", sh = "out-0"): WorkflowEdge {
  return { id: `e-${source}-${target}-${th}`, source, sourceHandle: sh, target, targetHandle: th };
}
function graph(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
  return { schemaVersion: 1, name: "t", nodes, edges };
}
const file = (name: string): UploadedFile => ({
  name,
  mime: "application/octet-stream",
  data: new Uint8Array([1, 2, 3]),
});

describe("matchPatterns", () => {
  it("matches * and ?, case-insensitive, filename only", () => {
    expect(matchPatterns("a.mp3", "*.mp3")).toBe(true);
    expect(matchPatterns("A.MP3", "*.mp3")).toBe(true);
    expect(matchPatterns("a.mp4", "*.mp3")).toBe(false);
    expect(matchPatterns("ab.mp3", "a?.mp3")).toBe(true);
    expect(matchPatterns("abb.mp3", "a?.mp3")).toBe(false);
  });
  it("ORs comma-separated patterns, empty passes everything", () => {
    expect(matchPatterns("a.wav", "*.mp3, *.wav")).toBe(true);
    expect(matchPatterns("a.flac", "*.mp3, *.wav")).toBe(false);
    expect(matchPatterns("anything.bin", "")).toBe(true);
    expect(matchPatterns("anything.bin", "  , ")).toBe(true);
  });
});

describe("naturalCompare", () => {
  it("compares digit runs numerically", () => {
    expect(["a10", "a2", "a1"].sort(naturalCompare)).toEqual(["a1", "a2", "a10"]);
    expect(naturalCompare("b", "a")).toBeGreaterThan(0);
  });
});

describe("suffixFilename", () => {
  it("inserts the label before the extension", () => {
    expect(suffixFilename("out.mp4", "001")).toBe("out_001.mp4");
    expect(suffixFilename("out", "001")).toBe("out_001");
  });
});

describe("analyzeStreams", () => {
  it("one stream per glob chain; direct connection = empty chain", () => {
    const u = upload();
    const ga = glob("*.mp3");
    const gv = glob("*.mp4");
    const out = output();
    const g = graph(
      [u, ga, gv, out],
      [edge(u.id, ga.id), edge(u.id, gv.id), edge(ga.id, out.id, "in-1"), edge(gv.id, out.id)],
    );
    const streams = analyzeStreams(g);
    expect(streams).toHaveLength(2);
    expect(streams.map((s) => s.globIds)).toEqual([[ga.id], [gv.id]]);
    expect(streams.every((s) => s.uploadId === u.id)).toBe(true);
  });

  it("chained globs form one stream; a mid-chain tap is its own stream", () => {
    const u = upload();
    const g1 = glob("*.mp3");
    const g2 = glob("a*");
    const out1 = output("x.mp4");
    const out2 = output("y.mp4");
    const g = graph(
      [u, g1, g2, out1, out2],
      [edge(u.id, g1.id), edge(g1.id, g2.id), edge(g1.id, out1.id), edge(g2.id, out2.id)],
    );
    const chains = analyzeStreams(g)
      .map((s) => s.globIds)
      .sort();
    expect(chains).toEqual([[g1.id], [g1.id, g2.id]].sort());
  });

  it("upload directly to a sink is a stream with no globs", () => {
    const u = upload();
    const out = output();
    const g = graph([u, out], [edge(u.id, out.id)]);
    const streams = analyzeStreams(g);
    expect(streams).toHaveLength(1);
    expect(streams[0].globIds).toEqual([]);
  });
});

describe("streamFiles", () => {
  it("natural-sorts then applies every glob in the chain (AND)", () => {
    const u = upload();
    const g1 = glob("*.mp3");
    const g2 = glob("a*");
    const out = output();
    const g = graph([u, g1, g2, out], [edge(u.id, g1.id), edge(g1.id, g2.id), edge(g2.id, out.id)]);
    const [stream] = analyzeStreams(g);
    const files = streamFiles(stream, g, [
      file("b10.mp3"),
      file("a2.mp3"),
      file("a1.mp4"),
      file("b1.mp3"),
      file("a10.mp3"),
    ]);
    // *.mp3 keeps mp3s, a* keeps only a-prefixed, natural order
    expect(files.map((f) => f.name)).toEqual(["a2.mp3", "a10.mp3"]);
  });
});

describe("bindIterationGraph", () => {
  function avGraph() {
    const u = upload({ inputSS: "5", vStream: 1 });
    const ga = glob("*.mp3");
    const gv = glob("*.mp4");
    const out = output("out.mp4");
    const g = graph(
      [u, ga, gv, out],
      [edge(u.id, ga.id), edge(u.id, gv.id), edge(ga.id, out.id, "in-1"), edge(gv.id, out.id)],
    );
    return { g, u, ga, gv, out };
  }

  it("binds each stream to a synthetic asset and rewires materialization edges", () => {
    const { g, ga, gv } = avGraph();
    const streams = analyzeStreams(g);
    const audio = streams.find((s) => s.globIds.includes(ga.id))!;
    const video = streams.find((s) => s.globIds.includes(gv.id))!;
    const bound = bindIterationGraph(
      g,
      [
        { stream: audio, file: file("a.mp3") },
        { stream: video, file: file("b.mp4") },
      ],
      "001",
    );

    // upload & globs gone, two synthetic assets in
    expect(bound.nodes.some((n) => n.kind === "upload" || n.kind === "glob")).toBe(false);
    const synths = bound.nodes.filter((n) => n.kind === "asset");
    expect(synths).toHaveLength(2);
    // input-side options inherited from the upload node
    expect(synths.every((n) => n.kind === "asset" && n.inputSS === "5" && n.vStream === 1)).toBe(
      true,
    );
    // sink filename suffixed with the iteration label
    const out = bound.nodes.find((n) => n.kind === "output")!;
    expect(out.filename).toBe("out_001.mp4");
    // materialization edges rewired to the synthetic nodes
    const audioSyn = syntheticAssetId(audio.id);
    const videoSyn = syntheticAssetId(video.id);
    expect(
      bound.edges.some(
        (e) => e.source === audioSyn && e.target === out.id && e.targetHandle === "in-1",
      ),
    ).toBe(true);
    expect(
      bound.edges.some(
        (e) => e.source === videoSyn && e.target === out.id && e.targetHandle === "in-0",
      ),
    ).toBe(true);
    expect(bound.edges.some((e) => e.source === ga.id || e.source === gv.id)).toBe(false);
  });

  it("the bound graph compiles to a normal job with two inputs", () => {
    const { g, ga, gv } = avGraph();
    const streams = analyzeStreams(g);
    const bound = bindIterationGraph(
      g,
      streams.map((s) => ({
        stream: s,
        file: file(s.globIds.includes(ga.id) ? "a.mp3" : "b.mp4"),
      })),
      "001",
    );
    const { job, errors } = compileGraph(bound);
    expect(errors).toEqual([]);
    expect(job).toBeDefined();
    expect(job!.segments).toHaveLength(1);
    expect(job!.segments[0].inputs).toHaveLength(2);
    expect(job!.segments[0].outputs[0].file).toBe("out_001.mp4");
    const args = job!.segments[0].args.join(" ");
    expect(args).toContain("-ss 5");
    expect(args).toContain("out_001.mp4");
  });
});
