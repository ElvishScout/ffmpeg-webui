<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    clearable?: boolean;
    type?: "text" | "textarea";
    rows?: number;
  }>(),
  { type: "text", rows: 2 },
);
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();

const fieldClass =
  "w-full rounded-md border border-line bg-card px-2 text-xs text-fg outline-none placeholder:text-faint focus:border-accent";
const showClear = computed(() => props.clearable && props.modelValue.length > 0);
</script>

<template>
  <textarea
    v-if="type === 'textarea'"
    :value="modelValue"
    :rows="rows"
    :placeholder="placeholder"
    :class="[fieldClass, '[field-sizing:content] resize-y py-1.5']"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
  <div v-else class="relative">
    <input
      :value="modelValue"
      type="text"
      :placeholder="placeholder"
      :class="[fieldClass, 'h-7', clearable ? 'pr-6' : '']"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      v-if="showClear"
      type="button"
      class="text-faint hover:text-fg absolute top-1/2 right-1.5 -translate-y-1/2 cursor-pointer"
      @click="emit('update:modelValue', '')"
    >
      ✕
    </button>
  </div>
</template>
