import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  AssetRef,
  NodeDraft,
} from "../types/graph";
import type { PortType } from "../types/filter";
import { SCHEMA_VERSION } from "../types/graph";
import { validateGraph, inputPads, outputPads, portsCompatible } from "../compiler/validate";
import { compileGraph, type CompileResult } from "../compiler/compile";
import { FORMATS } from "../compiler/formats";
import type { OutputFormat } from "../types/graph";
import { useAssetsStore } from "./assets";
import { missingRefs } from "../data/match";

let nodeSeq = 0;

export const useGraphStore = defineStore("graph", () => {
  const name = ref("");
  const nodes = ref<WorkflowNode[]>([]);
  const edges = ref<WorkflowEdge[]>([]);
  const selectedId = ref<string | null>(null);
  /** bumped on structural replacement (load/clear/add/remove) so the canvas rebuilds */
  const revision = ref(0);

  const assetsStore = useAssetsStore();

  const missingAssetIds = computed<Set<string>>(() => {
    const refs = nodes.value.flatMap((n) => (n.kind === "asset" ? [n.assetRef] : []));
    return missingRefs(refs, assetsStore.assets);
  });

  /** graphs with upload nodes run in batch mode: files are collected per run */
  const hasUploads = computed(() => nodes.value.some((n) => n.kind === "upload"));

  const graph = computed<WorkflowGraph>(() => ({
    schemaVersion: SCHEMA_VERSION,
    name: name.value,
    nodes: nodes.value,
    edges: edges.value,
  }));

  const validation = computed(() =>
    validateGraph(graph.value, { missingAssetIds: missingAssetIds.value }),
  );

  function compile(): CompileResult {
    return compileGraph(graph.value, {
      assetDurations: assetsStore.durations(),
      missingAssetIds: missingAssetIds.value,
    });
  }

  function load(g: WorkflowGraph, workflowName?: string) {
    nodes.value = g.nodes.map((n) => ({ ...n, position: { ...n.position } }));
    edges.value = g.edges.map((e) => ({ ...e }));
    name.value = workflowName ?? g.name;
    selectedId.value = null;
    revision.value++;
  }

  function clear() {
    nodes.value = [];
    edges.value = [];
    name.value = "";
    selectedId.value = null;
    revision.value++;
  }

  function addNode(draft: NodeDraft & { position?: { x: number; y: number } }): WorkflowNode {
    const n = {
      ...draft,
      id: `n${Date.now().toString(36)}_${nodeSeq++}`,
      position: draft.position ?? {
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
      },
    } as WorkflowNode;
    nodes.value.push(n);
    selectedId.value = n.id;
    revision.value++;
    return n;
  }

  /**
   * Default filename for a new sink node: `output.<ext>` / `mid.<ext>`,
   * suffixed (_2, _3, …) until it no longer collides with an existing sink.
   */
  function nextSinkFilename(kind: "stage" | "output", format: OutputFormat = "mp4"): string {
    const base = kind === "stage" ? "mid" : "output";
    const ext = FORMATS[format].ext;
    const taken = new Set(
      nodes.value.flatMap((n) =>
        (n.kind === "stage" || n.kind === "output") && n.filename ? [n.filename] : [],
      ),
    );
    let name = `${base}.${ext}`;
    for (let i = 2; taken.has(name); i++) name = `${base}_${i}.${ext}`;
    return name;
  }

  function addSinkNode(
    kind: "stage" | "output",
    format: OutputFormat = "mp4",
    position?: { x: number; y: number },
  ) {
    return addNode({
      kind,
      format,
      filename: nextSinkFilename(kind, format),
      position,
    });
  }

  function addAssetNode(ref: AssetRef, position?: { x: number; y: number }) {
    return addNode({ kind: "asset", assetRef: ref, position });
  }

  function updateNode(id: string, patch: Partial<WorkflowNode>) {
    const n = nodes.value.find((x) => x.id === id);
    if (n) Object.assign(n, patch);
  }

  function updateParam(id: string, key: string, value: unknown) {
    const n = nodes.value.find((x) => x.id === id);
    if (
      n &&
      (n.kind === "filter" || n.kind === "source" || n.kind === "upload" || n.kind === "glob")
    ) {
      n.params = { ...(n.params ?? {}), [key]: value };
    }
  }

  function removeNode(id: string) {
    nodes.value = nodes.value.filter((n) => n.id !== id);
    edges.value = edges.value.filter((e) => e.source !== id && e.target !== id);
    if (selectedId.value === id) selectedId.value = null;
    revision.value++;
  }

  function removeEdge(id: string) {
    edges.value = edges.value.filter((e) => e.id !== id);
  }

  function addEdge(e: WorkflowEdge) {
    // one edge per input pad
    edges.value = edges.value.filter(
      (x) => !(x.target === e.target && x.targetHandle === e.targetHandle),
    );
    edges.value.push(e);
  }

  /** Live connection check used by Vue Flow's isValidConnection. */
  function canConnect(
    sourceId: string,
    sourceHandle: string,
    targetId: string,
    targetHandle: string,
  ): boolean {
    if (sourceId === targetId) return false;
    const src = nodes.value.find((n) => n.id === sourceId);
    const dst = nodes.value.find((n) => n.id === targetId);
    if (!src || !dst) return false;
    const from = outputPads(src)[Number(sourceHandle.replace("out-", ""))]?.type;
    const to = inputPads(dst)[Number(targetHandle.replace("in-", ""))]?.type;
    if (!from || !to || !portsCompatible(from, to)) return false;
    // would this introduce a cycle? walk downstream from target
    const adj = new Map<string, string[]>();
    for (const e of edges.value) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    adj.set(sourceId, [...(adj.get(sourceId) ?? []), targetId]);
    const seen = new Set<string>();
    const stack = [targetId];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === sourceId) return false;
      if (seen.has(cur)) continue;
      seen.add(cur);
      stack.push(...(adj.get(cur) ?? []));
    }
    return true;
  }

  /** Remap a ghost asset reference to an existing local asset. */
  function remapAsset(oldId: string, newRef: AssetRef) {
    for (const n of nodes.value) {
      if (n.kind === "asset" && n.assetRef?.id === oldId) {
        n.assetRef = newRef;
      }
    }
  }

  /** Pad type lookup for handle coloring in node components. */
  function padTypes(node: WorkflowNode): {
    inputs: PortType[];
    outputs: PortType[];
  } {
    return {
      inputs: inputPads(node).map((p) => p.type),
      outputs: outputPads(node).map((p) => p.type),
    };
  }

  return {
    name,
    nodes,
    edges,
    selectedId,
    revision,
    graph,
    validation,
    missingAssetIds,
    hasUploads,
    compile,
    load,
    clear,
    addNode,
    addAssetNode,
    addSinkNode,
    nextSinkFilename,
    updateNode,
    updateParam,
    removeNode,
    removeEdge,
    addEdge,
    canConnect,
    remapAsset,
    padTypes,
  };
});
