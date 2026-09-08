<script setup lang="ts">
import { ref, watch } from "vue";
import {
  VueFlow,
  useVueFlow,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Node,
  type Edge,
} from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import { MiniMap } from "@vue-flow/minimap";
import FlowNode from "./FlowNode.vue";
import { useGraphStore } from "../../stores/graph";
import type { WorkflowEdge } from "../../types/graph";

const store = useGraphStore();

const vfNodes = ref<Node[]>([]);
const vfEdges = ref<Edge[]>([]);

const { onNodesChange, onEdgesChange, onConnect, setNodes, setEdges, screenToFlowCoordinate } =
  useVueFlow();

// Full rebuild when the store signals structural replacement (load/clear/add)
watch(
  () => store.revision,
  () => {
    setNodes(
      store.nodes.map((n) => ({
        id: n.id,
        type: "wf",
        position: n.position,
        data: {},
        selected: n.id === store.selectedId,
      })),
    );
    setEdges(
      store.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
    );
  },
  { immediate: true },
);

onNodesChange((changes: NodeChange[]) => {
  for (const c of changes) {
    if (c.type === "position" && c.position) {
      store.updateNode(c.id, { position: c.position });
    } else if (c.type === "remove") {
      store.removeNode(c.id);
    } else if (c.type === "select") {
      if (c.selected) store.selectedId = c.id;
      else if (store.selectedId === c.id) store.selectedId = null;
    }
  }
});

onEdgesChange((changes: EdgeChange[]) => {
  for (const c of changes) {
    if (c.type === "remove") store.removeEdge(c.id);
  }
});

onConnect((conn: Connection) => {
  if (!conn.sourceHandle || !conn.targetHandle) return;
  if (!store.canConnect(conn.source, conn.sourceHandle, conn.target, conn.targetHandle)) return;
  const e: WorkflowEdge = {
    id: `e-${conn.source}-${conn.sourceHandle}-${conn.target}-${conn.targetHandle}`,
    source: conn.source,
    sourceHandle: conn.sourceHandle,
    target: conn.target,
    targetHandle: conn.targetHandle,
  };
  store.addEdge(e);
  vfEdges.value = [
    ...vfEdges.value.filter((x) => !(x.target === e.target && x.targetHandle === e.targetHandle)),
    { ...e },
  ];
});

const isValidConnection = (conn: Connection) =>
  !!(conn.sourceHandle && conn.targetHandle) &&
  store.canConnect(conn.source, conn.sourceHandle, conn.target, conn.targetHandle);

// accept drops from the asset panel
function onDrop(event: DragEvent) {
  const payload = event.dataTransfer?.getData("application/ffmpeg-webui");
  if (!payload) return;
  const parsed = JSON.parse(payload) as
    | {
        type: "asset";
        id: string;
        filename: string;
        size: number;
        mime: string;
      }
    | { type: "filter"; name: string }
    | { type: "source"; name?: string }
    | { type: "special"; kind: "stage" | "output" | "raw" };
  const position = screenToFlowCoordinate({
    x: event.clientX,
    y: event.clientY,
  });
  if (parsed.type === "asset") {
    store.addAssetNode(
      {
        id: parsed.id,
        filename: parsed.filename,
        size: parsed.size,
        mime: parsed.mime,
      },
      position,
    );
  } else if (parsed.type === "filter") {
    store.addNode({
      kind: "filter",
      filterName: parsed.name,
      params: {},
      position,
    });
  } else if (parsed.type === "source") {
    store.addNode({
      kind: "source",
      position,
      ...(parsed.name
        ? { filterName: parsed.name, params: {} }
        : { sourceFilter: "", sourceOutputs: ["video" as const] }),
    });
  } else if (parsed.kind === "stage" || parsed.kind === "output") {
    store.addSinkNode(parsed.kind, "mp4", position);
  } else {
    store.addNode({
      kind: parsed.kind,
      position,
      rawFilter: "",
      rawInputs: ["video" as const],
      rawOutputs: ["video" as const],
    });
  }
}
</script>

<template>
  <VueFlow
    v-model:nodes="vfNodes"
    v-model:edges="vfEdges"
    :delete-key-code="['Delete', 'Backspace']"
    :is-valid-connection="isValidConnection"
    :default-viewport="{ zoom: 0.9 }"
    :min-zoom="0.2"
    :max-zoom="2.5"
    class="editor-canvas"
    @drop="onDrop"
    @dragover.prevent
  >
    <Background :gap="20" pattern-color="#2a2a33" />
    <Controls position="bottom-left" />
    <MiniMap position="bottom-right" pannable zoomable />
    <template #node-wf="props">
      <FlowNode :id="props.id" :selected="props.selected" />
    </template>
  </VueFlow>
</template>

<style scoped>
.editor-canvas {
  height: 100%;
  width: 100%;
}
</style>
