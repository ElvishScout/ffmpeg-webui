<script setup lang="ts">
import { computed } from "vue";
import InputNumber from "../ui/InputNumber.vue";
import Input from "../ui/Input.vue";
import Switch from "../ui/Switch.vue";
import Select from "../ui/Select.vue";
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
  <InputNumber
    v-if="spec.type === 'number'"
    v-model="num"
    :min="spec.min"
    :max="spec.max"
    :step="spec.step"
  />
  <Switch v-else-if="spec.type === 'boolean'" v-model="bool" />
  <Select v-else-if="spec.type === 'select'" v-model="str" :options="selectOptions" />
  <div v-else-if="spec.type === 'color'" class="color-field">
    <input
      type="color"
      :value="str.startsWith('#') ? str : '#ffffff'"
      class="border-line h-7 w-11 flex-none cursor-pointer rounded border bg-transparent p-0.5"
      @input="emit('update', ($event.target as HTMLInputElement).value)"
    />
    <Input v-model="str" :placeholder="spec.placeholder ?? 'white'" />
  </div>
  <Input v-else v-model="str" :placeholder="spec.placeholder" />
</template>

<style scoped>
.color-field {
  display: flex;
  gap: 6px;
  align-items: center;
}
</style>
