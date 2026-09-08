import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from "../types/graph";
import type { PortSpec, PortType } from "../types/filter";
import { filterByName } from "../filters/registry";
import { FORMATS, formatOf, formatKind } from "./formats";

/** Input pads of a node, in handle order (handle id = `in-{index}`). */
export function inputPads(node: WorkflowNode): PortSpec[] {
  switch (node.kind) {
    case "asset":
    case "source":
      return [];
    case "stage":
    case "output": {
      const audioPads = node.audioPads ?? 1;
      return [
        { type: "video", label: { zh: "视频", en: "video" } },
        ...Array.from({ length: Math.max(0, audioPads) }, () => ({
          type: "audio" as const,
          label: { zh: "音频", en: "audio" },
        })),
      ];
    }
    case "filter": {
      const spec = node.filterName ? filterByName.get(node.filterName) : undefined;
      if (!spec) return [];
      if (spec.inputsFrom) {
        const n = node.inputCount ?? Number(node.params?.[spec.inputsFrom]) ?? spec.inputs.length;
        return Array.from({ length: Math.max(1, n) }, () => spec.inputs[0]);
      }
      return spec.inputs;
    }
    case "raw":
      return (node.rawInputs ?? ["video"]).map((type) => ({ type }));
  }
}

/** Output pads of a node (handle id = `out-{index}`). */
export function outputPads(node: WorkflowNode): PortSpec[] {
  switch (node.kind) {
    case "asset":
      return [{ type: "av" }];
    case "output":
      return [];
    case "source":
      return (node.sourceOutputs ?? ["video"]).map((type) => ({ type }));
    case "stage":
      return [{ type: "av" }];
    case "filter": {
      const spec = node.filterName ? filterByName.get(node.filterName) : undefined;
      if (!spec) return [];
      if (spec.outputsFrom) {
        const n =
          node.outputCount ?? Number(node.params?.[spec.outputsFrom]) ?? spec.outputs.length;
        return Array.from({ length: Math.max(1, n) }, () => spec.outputs[0]);
      }
      return spec.outputs;
    }
    case "raw":
      return (node.rawOutputs ?? ["video"]).map((type) => ({ type }));
  }
}

/** May an edge run from a port of type `from` into one of type `to`? */
export function portsCompatible(from: PortType, to: PortType): boolean {
  if (from === "av") return true; // a media file can feed a video or audio pad
  return from === to;
}

export interface ValidationError {
  /** i18n key under `validation.*` */
  code:
    | "cycle"
    | "portType"
    | "inputUnconnected"
    | "outputUnconnected"
    | "outputNoInput"
    | "filenameRequired"
    | "assetMissing"
    | "noOutput"
    | "filterUnknown"
    | "rawEmpty"
    | "sourceEmpty"
    | "presetAudioOnly"
    | "presetVideoOnly"
    | "presetUnsupported";
  nodeId?: string;
  /** display name for messages */
  nodeName?: string;
}

export interface ValidationResult {
  errors: ValidationError[];
  ok: boolean;
}

export function nodeDisplayName(node: WorkflowNode): string {
  switch (node.kind) {
    case "asset":
      return node.assetRef?.filename ?? "asset";
    case "source":
      return node.sourceFilter?.split("=")[0] || "source";
    case "filter":
      return node.filterName ?? "filter";
    case "raw":
      return node.rawFilter?.split("=")[0] || "raw";
    case "stage":
      return node.filename || "stage";
    case "output":
      return node.filename || "output";
  }
}

/** Topological order (Kahn). Returns null if the graph has a cycle. */
export function topoSort(graph: WorkflowGraph): WorkflowNode[] | null {
  const indeg = new Map<string, number>();
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const n of graph.nodes) indeg.set(n.id, 0);
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const queue = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: WorkflowNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    for (const next of adj.get(id) ?? []) {
      const d = indeg.get(next)! - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order.length === graph.nodes.length ? order : null;
}

export function edgePortTypes(
  graph: WorkflowGraph,
  edge: WorkflowEdge,
): { from?: PortType; to?: PortType } {
  const src = graph.nodes.find((n) => n.id === edge.source);
  const dst = graph.nodes.find((n) => n.id === edge.target);
  if (!src || !dst) return {};
  const fromPad = Number(edge.sourceHandle.replace("out-", ""));
  const toPad = Number(edge.targetHandle.replace("in-", ""));
  return {
    from: outputPads(src)[fromPad]?.type,
    to: inputPads(dst)[toPad]?.type,
  };
}

export function validateGraph(
  graph: WorkflowGraph,
  ctx: { missingAssetIds?: Set<string> } = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  if (!graph.nodes.some((n) => n.kind === "output")) {
    errors.push({ code: "noOutput" });
  }

  if (topoSort(graph) === null) {
    errors.push({ code: "cycle" });
    return { errors, ok: false }; // further checks are unreliable on cyclic graphs
  }

  const edgesInto = new Map<string, WorkflowEdge[]>();
  const edgesOutOf = new Map<string, WorkflowEdge[]>();
  for (const e of graph.edges) {
    edgesInto.set(e.target, [...(edgesInto.get(e.target) ?? []), e]);
    edgesOutOf.set(e.source, [...(edgesOutOf.get(e.source) ?? []), e]);
  }

  for (const e of graph.edges) {
    const { from, to } = edgePortTypes(graph, e);
    if (from && to && !portsCompatible(from, to)) {
      errors.push({
        code: "portType",
        nodeId: e.target,
        nodeName: nodeDisplayName(byId.get(e.target)!),
      });
    }
  }

  for (const node of graph.nodes) {
    const name = nodeDisplayName(node);
    const into = edgesInto.get(node.id) ?? [];
    const outOf = edgesOutOf.get(node.id) ?? [];
    const connectedIn = new Set(into.map((e) => e.targetHandle));
    const connectedOut = new Set(outOf.map((e) => e.sourceHandle));

    switch (node.kind) {
      case "asset":
        if (node.assetRef && ctx.missingAssetIds?.has(node.assetRef.id)) {
          errors.push({
            code: "assetMissing",
            nodeId: node.id,
            nodeName: name,
          });
        }
        break;
      case "filter": {
        if (!node.filterName || !filterByName.has(node.filterName)) {
          errors.push({
            code: "filterUnknown",
            nodeId: node.id,
            nodeName: name,
          });
          break;
        }
        const pads = inputPads(node);
        for (let i = 0; i < pads.length; i++) {
          if (!connectedIn.has(`in-${i}`)) {
            errors.push({
              code: "inputUnconnected",
              nodeId: node.id,
              nodeName: name,
            });
            break;
          }
        }
        // ffmpeg requires every filter output pad to be connected
        const outs = outputPads(node);
        for (let i = 0; i < outs.length; i++) {
          if (!connectedOut.has(`out-${i}`)) {
            errors.push({
              code: "outputUnconnected",
              nodeId: node.id,
              nodeName: name,
            });
            break;
          }
        }
        break;
      }
      case "source": {
        if (!node.sourceFilter?.trim()) {
          errors.push({ code: "sourceEmpty", nodeId: node.id, nodeName: name });
        }
        if (outputPads(node).length === 0) {
          errors.push({ code: "sourceEmpty", nodeId: node.id, nodeName: name });
        }
        const outs = outputPads(node);
        for (let i = 0; i < outs.length; i++) {
          if (!connectedOut.has(`out-${i}`)) {
            errors.push({
              code: "outputUnconnected",
              nodeId: node.id,
              nodeName: name,
            });
            break;
          }
        }
        break;
      }
      case "raw": {
        if (!node.rawFilter?.trim()) {
          errors.push({ code: "rawEmpty", nodeId: node.id, nodeName: name });
        }
        const pads = inputPads(node);
        for (let i = 0; i < pads.length; i++) {
          if (!connectedIn.has(`in-${i}`)) {
            errors.push({
              code: "inputUnconnected",
              nodeId: node.id,
              nodeName: name,
            });
            break;
          }
        }
        const outs = outputPads(node);
        for (let i = 0; i < outs.length; i++) {
          if (!connectedOut.has(`out-${i}`)) {
            errors.push({
              code: "outputUnconnected",
              nodeId: node.id,
              nodeName: name,
            });
            break;
          }
        }
        break;
      }
      case "stage":
      case "output": {
        if (into.length === 0)
          errors.push({
            code: "outputNoInput",
            nodeId: node.id,
            nodeName: name,
          });
        if (!node.filename?.trim())
          errors.push({
            code: "filenameRequired",
            nodeId: node.id,
            nodeName: name,
          });
        // audio formats reject a connected video pad; animated-image formats reject audio pads
        const kind = formatKind(node);
        if (kind === "audio" && connectedIn.has("in-0")) {
          errors.push({
            code: "presetAudioOnly",
            nodeId: node.id,
            nodeName: name,
          });
        }
        if (kind === "video") {
          const pads = inputPads(node);
          for (let i = 1; i < pads.length; i++) {
            if (connectedIn.has(`in-${i}`)) {
              errors.push({
                code: "presetVideoOnly",
                nodeId: node.id,
                nodeName: name,
              });
              break;
            }
          }
        }
        // the encode strategy must be one the format supports
        if (node.preset && !FORMATS[formatOf(node)].presets.includes(node.preset)) {
          errors.push({
            code: "presetUnsupported",
            nodeId: node.id,
            nodeName: name,
          });
        }
        break;
      }
    }
  }

  return { errors, ok: errors.length === 0 };
}
