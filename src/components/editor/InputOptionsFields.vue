<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Field from "../ui/Field.vue";
import Input from "../ui/Input.vue";
import InputNumber from "../ui/InputNumber.vue";
import { useGraphStore } from "../../stores/graph";
import type { AssetNode, UploadNode } from "../../types/graph";

/** Input-side ffmpeg options shared by asset and upload nodes (applied before -i). */
defineProps<{ node: AssetNode | UploadNode }>();
const store = useGraphStore();
const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-3">
    <Field>
      <template #label
        >-ss <span class="param-desc">{{ t("inspector.inputSSHint") }}</span></template
      >
      <Input
        :model-value="node.inputSS ?? ''"
        placeholder="10 或 00:00:10"
        @update:model-value="(v: string) => store.updateNode(node.id, { inputSS: v })"
      />
    </Field>
    <Field>
      <template #label
        >-t <span class="param-desc">{{ t("inspector.inputTHint") }}</span></template
      >
      <Input
        :model-value="node.inputT ?? ''"
        placeholder="5"
        @update:model-value="(v: string) => store.updateNode(node.id, { inputT: v })"
      />
    </Field>
    <Field>
      <template #label
        >-stream_loop <span class="param-desc">{{ t("inspector.streamLoopHint") }}</span></template
      >
      <InputNumber
        :model-value="node.streamLoop ?? null"
        :placeholder="t('inspector.unset')"
        @update:model-value="
          (v: number | null) => store.updateNode(node.id, { streamLoop: v ?? undefined })
        "
      />
    </Field>
    <Field>
      <template #label>{{ t("inspector.vStream") }}</template>
      <InputNumber
        :model-value="node.vStream ?? 0"
        :min="0"
        @update:model-value="(v: number | null) => store.updateNode(node.id, { vStream: v ?? 0 })"
      />
    </Field>
    <Field>
      <template #label>{{ t("inspector.aStream") }}</template>
      <InputNumber
        :model-value="node.aStream ?? 0"
        :min="0"
        @update:model-value="(v: number | null) => store.updateNode(node.id, { aStream: v ?? 0 })"
      />
    </Field>
  </div>
</template>

<style scoped>
.param-desc {
  color: #6b7280;
  font-size: 12px;
  margin-left: 6px;
}
</style>
