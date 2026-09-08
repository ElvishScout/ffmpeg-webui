<script setup lang="ts">
const props = defineProps<{
  modelValue: number | null;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: number | null): void }>();

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  // 清空 → null(“未设置”语义),绝不清零
  if (raw === "") {
    emit("update:modelValue", null);
    return;
  }
  const n = Number(raw);
  if (!Number.isNaN(n)) emit("update:modelValue", n);
}

function clamp() {
  let v = props.modelValue;
  if (v == null) return;
  if (props.min != null && v < props.min) v = props.min;
  if (props.max != null && v > props.max) v = props.max;
  if (v !== props.modelValue) emit("update:modelValue", v);
}
</script>

<template>
  <input
    type="number"
    :value="modelValue ?? ''"
    :min="min"
    :max="max"
    :step="step"
    :placeholder="placeholder"
    class="border-line bg-card text-fg placeholder:text-faint focus:border-accent h-7 w-full rounded-md border px-2 text-xs outline-none"
    @input="onInput"
    @change="clamp"
  />
</template>
