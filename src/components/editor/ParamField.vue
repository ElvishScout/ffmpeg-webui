<script setup lang="ts">
import { computed } from "vue";
import { NInputNumber, NInput, NSwitch, NSelect, NColorPicker } from "naive-ui";
import type { ParamSpec } from "../../types/filter";

const props = defineProps<{ spec: ParamSpec; value: unknown }>();
const emit = defineEmits<{ (e: "update", value: unknown): void }>();

const num = computed<number | null>({
  get: () =>
    typeof props.value === "number" ? props.value : ((props.spec.default as number) ?? null),
  set: (v) => emit("update", v),
});
const str = computed<string>({
  get: () =>
    typeof props.value === "string" ? props.value : ((props.spec.default as string) ?? ""),
  set: (v) => emit("update", v),
});
const bool = computed<boolean>({
  get: () => Boolean(props.value ?? props.spec.default),
  set: (v) => emit("update", v),
});
const selectOptions = computed(() =>
  (props.spec.options ?? []).map((o) => ({ value: o.value, label: o.value })),
);
</script>

<template>
  <NInputNumber
    v-if="spec.type === 'number'"
    v-model:value="num"
    size="small"
    :min="spec.min"
    :max="spec.max"
    :step="spec.step"
  />
  <NSwitch v-else-if="spec.type === 'boolean'" v-model:value="bool" size="small" />
  <NSelect
    v-else-if="spec.type === 'select'"
    v-model:value="str"
    size="small"
    :options="selectOptions"
  />
  <div v-else-if="spec.type === 'color'" class="color-field">
    <NColorPicker
      :value="str.startsWith('#') ? str : undefined"
      size="small"
      :show-alpha="false"
      @update:value="(v: string) => emit('update', v)"
    />
    <NInput v-model:value="str" size="small" :placeholder="spec.placeholder ?? 'white'" />
  </div>
  <NInput v-else v-model:value="str" size="small" :placeholder="spec.placeholder" />
</template>

<style scoped>
.color-field {
  display: flex;
  gap: 6px;
  align-items: center;
}
.color-field :deep(.n-color-picker) {
  width: 90px;
  flex: none;
}
.color-field :deep(.n-input) {
  flex: 1;
}
</style>
