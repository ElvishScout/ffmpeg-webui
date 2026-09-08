<script setup lang="ts">
import { computed } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { useI18n } from "vue-i18n";
import { useGraphStore } from "../../stores/graph";
import { nodeDisplayName } from "../../compiler/validate";

const props = defineProps<{ id: string; selected?: boolean }>();

const store = useGraphStore();
const { t } = useI18n();

const node = computed(() => store.nodes.find((n) => n.id === props.id)!);
const pads = computed(() => store.padTypes(node.value));
const displayName = computed(() => nodeDisplayName(node.value));

const isGhost = computed(
  () =>
    node.value.kind === "asset" &&
    node.value.assetRef &&
    store.missingAssetIds.has(node.value.assetRef.id),
);

const hasError = computed(() => store.validation.errors.some((e) => e.nodeId === props.id));

const kindLabel = computed(() =>
  node.value.kind === "filter" || node.value.kind === "source"
    ? (node.value.filterName ?? node.value.kind)
    : node.value.kind,
);

const portText = (type: string) => (type === "video" ? "v" : type === "audio" ? "a" : "av");
</script>

<template>
  <div
    v-if="node"
    class="wf-node"
    :class="{ selected, 'has-error': hasError, 'is-ghost': isGhost }"
  >
    <div class="wf-node__header" :class="`kind-${node.kind}`">
      <span>{{ kindLabel }}</span>
    </div>
    <div class="wf-node__body">
      <template v-if="node.kind === 'asset'">
        <span v-if="isGhost">⚠ {{ t("node.ghost", { name: node.assetRef?.filename }) }}</span>
        <span v-else>{{ node.assetRef?.filename }}</span>
      </template>
      <template v-else-if="node.kind === 'raw'">
        {{ node.rawFilter || "…" }}
      </template>
      <template v-else-if="node.kind === 'source'">
        {{ node.filterName ?? (node.sourceFilter || "…") }}
      </template>
      <template v-else-if="node.kind === 'stage' || node.kind === 'output'">
        {{ node.filename || "…" }}
      </template>
      <template v-else>
        {{ displayName }}
      </template>
    </div>
    <div class="wf-node__ports">
      <div v-for="(p, i) in pads.inputs" :key="`in-${i}`" class="wf-node__port">
        {{ portText(p) }}
        <Handle :id="`in-${i}`" type="target" :position="Position.Left" :class="`port-${p}`" />
      </div>
      <div
        v-for="(p, i) in pads.outputs"
        :key="`out-${i}`"
        class="wf-node__port wf-node__port--out"
      >
        {{ portText(p) }}
        <Handle :id="`out-${i}`" type="source" :position="Position.Right" :class="`port-${p}`" />
      </div>
    </div>
  </div>
</template>
