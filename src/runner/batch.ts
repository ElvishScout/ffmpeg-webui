import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from "../types/graph";

/**
 * Batch execution support: upload/glob stream analysis and per-iteration
 * graph binding. Pure functions — the run store drives the iteration loop,
 * each iteration compiles its bound graph with the regular compiler.
 */

/** A file picked at run time for one upload node (in-memory, never persisted). */
export interface UploadedFile {
  name: string;
  mime: string;
  data: Uint8Array;
}

/**
 * One file stream: an upload node plus the glob chain that shapes it.
 * Fan-out from an upload (or a mid-chain tap off a glob) yields one stream per
 * distinct glob chain; materialization targets do not multiply streams.
 */
export interface FileStream {
  /** `${uploadId}/${globIds.join("/")}` — stable identity across analysis & binding */
  id: string;
  uploadId: string;
  globIds: string[];
}

/** Synthetic asset node id prefix used when binding a stream's file into a graph. */
const SYNTHETIC_PREFIX = "__upload_";

export function syntheticAssetId(streamId: string): string {
  return `${SYNTHETIC_PREFIX}${streamId}`;
}

function indexGraph(graph: WorkflowGraph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const outEdges = new Map<string, WorkflowEdge[]>();
  const inEdges = new Map<string, WorkflowEdge[]>();
  for (const e of graph.edges) {
    outEdges.set(e.source, [...(outEdges.get(e.source) ?? []), e]);
    inEdges.set(e.target, [...(inEdges.get(e.target) ?? []), e]);
  }
  return { byId, outEdges, inEdges };
}

/** All distinct file streams in the graph (one per upload → glob* leaf path). */
export function analyzeStreams(graph: WorkflowGraph): FileStream[] {
  const { byId, outEdges } = indexGraph(graph);
  const streams: FileStream[] = [];
  for (const n of graph.nodes) {
    if (n.kind !== "upload") continue;
    const walk = (nodeId: string, globIds: string[]) => {
      let terminal = false;
      for (const e of outEdges.get(nodeId) ?? []) {
        const target = byId.get(e.target);
        if (!target) continue;
        if (target.kind === "glob") walk(target.id, [...globIds, target.id]);
        else terminal = true; // materialization point: a non-glob node
      }
      // chains that never reach a non-glob node are dangling (validation flags them)
      if (terminal) {
        streams.push({ id: [n.id, ...globIds].join("/"), uploadId: n.id, globIds });
      }
    };
    walk(n.id, []);
  }
  return streams;
}

/** The stream an edge out of an upload/glob node belongs to (walk upstream). */
function streamForEdgeSource(
  byId: Map<string, WorkflowNode>,
  inEdges: Map<string, WorkflowEdge[]>,
  sourceId: string,
): FileStream | null {
  const chain: string[] = [];
  let cur = sourceId;
  for (;;) {
    const n = byId.get(cur);
    if (!n) return null;
    if (n.kind === "upload") {
      return { id: [n.id, ...chain].join("/"), uploadId: n.id, globIds: chain };
    }
    if (n.kind !== "glob") return null;
    chain.unshift(n.id);
    const up = (inEdges.get(n.id) ?? [])[0];
    if (!up) return null;
    cur = up.source;
  }
}

/** Compile one glob pattern to a RegExp: case-insensitive, `*` and `?` only. */
function globToRegExp(glob: string): RegExp {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${re}$`, "i");
}

/**
 * Does `name` match the comma-separated patterns? OR within one glob node;
 * an empty pattern list passes everything (unconfigured glob).
 */
export function matchPatterns(name: string, patterns: string): boolean {
  const pats = patterns
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!pats.length) return true;
  return pats.some((p) => globToRegExp(p).test(name));
}

/** Natural ordering: digit runs compare numerically (`a2` before `a10`). */
export function naturalCompare(a: string, b: string): number {
  const chunks = (s: string) => s.match(/\d+|\D+/g) ?? [];
  const ca = chunks(a);
  const cb = chunks(b);
  for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
    const da = /^\d+$/.test(ca[i]);
    const db = /^\d+$/.test(cb[i]);
    if (da && db) {
      const diff = Number(ca[i]) - Number(cb[i]);
      if (diff) return diff;
    } else {
      const diff = ca[i].localeCompare(cb[i]);
      if (diff) return diff;
    }
  }
  return ca.length - cb.length;
}

/** A stream's effective file list: natural-sorted, filtered by every glob in the chain (AND). */
export function streamFiles(
  stream: FileStream,
  graph: WorkflowGraph,
  uploaded: UploadedFile[],
): UploadedFile[] {
  const { byId } = indexGraph(graph);
  const sorted = [...uploaded].sort((x, y) => naturalCompare(x.name, y.name));
  return sorted.filter((f) =>
    stream.globIds.every((gid) => {
      const g = byId.get(gid);
      const patterns = g?.kind === "glob" ? String(g.params?.patterns ?? "") : "";
      return matchPatterns(f.name, patterns);
    }),
  );
}

/** One stream's file assignment for one iteration. */
export interface IterationBinding {
  stream: FileStream;
  file: UploadedFile;
}

/** `out.mp4` + `001` → `out_001.mp4` (no extension → append). */
export function suffixFilename(filename: string, label: string): string {
  const m = filename.match(/^(.*)(\.[a-z0-9]{2,5})$/i);
  return m ? `${m[1]}_${label}${m[2]}` : `${filename}_${label}`;
}

/**
 * Rewrite the graph for one iteration: each stream's current file becomes a
 * synthetic asset node (inheriting the upload node's input-side options),
 * upload/glob nodes are removed, materialization edges are rewired to the
 * synthetic nodes, and sink filenames get the iteration label suffix.
 */
export function bindIterationGraph(
  graph: WorkflowGraph,
  bindings: IterationBinding[],
  iterationLabel: string,
): WorkflowGraph {
  const { byId, inEdges } = indexGraph(graph);
  const syntheticIds = new Map<string, string>();
  const nodes: WorkflowNode[] = [];

  for (const b of bindings) {
    const upload = byId.get(b.stream.uploadId);
    if (upload?.kind !== "upload") continue;
    const id = syntheticAssetId(b.stream.id);
    syntheticIds.set(b.stream.id, id);
    nodes.push({
      kind: "asset",
      id,
      position: upload.position,
      assetRef: {
        id,
        filename: b.file.name,
        size: b.file.data.length,
        mime: b.file.mime || "application/octet-stream",
      },
      inputSS: upload.inputSS,
      inputT: upload.inputT,
      streamLoop: upload.streamLoop,
      vStream: upload.vStream,
      aStream: upload.aStream,
    });
  }

  const removed = new Set(
    graph.nodes.filter((n) => n.kind === "upload" || n.kind === "glob").map((n) => n.id),
  );
  for (const n of graph.nodes) {
    if (removed.has(n.id)) continue;
    if ((n.kind === "output" || n.kind === "stage") && n.filename) {
      nodes.push({ ...n, filename: suffixFilename(n.filename, iterationLabel) });
    } else {
      nodes.push(n);
    }
  }

  const edges: WorkflowEdge[] = [];
  for (const e of graph.edges) {
    if (removed.has(e.target)) continue; // into a glob: dropped with the chain
    if (!removed.has(e.source)) {
      edges.push(e);
      continue;
    }
    // edge out of an upload/glob into a materialization node
    const stream = streamForEdgeSource(byId, inEdges, e.source);
    const synId = stream ? syntheticIds.get(stream.id) : undefined;
    if (synId) edges.push({ ...e, source: synId, sourceHandle: "out-0" });
  }

  return { ...graph, nodes, edges };
}
