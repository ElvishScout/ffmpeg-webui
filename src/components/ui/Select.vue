<script setup lang="ts">
import type { SelectGroup, SelectOption } from "./types";

defineProps<{
  modelValue: string;
  options: Array<SelectOption | SelectGroup>;
  disabled?: boolean;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();

function isGroup(o: SelectOption | SelectGroup): o is SelectGroup {
  return "options" in o;
}
</script>

<template>
  <div class="relative">
    <select
      :value="modelValue"
      :disabled="disabled"
      class="border-line bg-card text-fg focus:border-accent h-7 w-full cursor-pointer appearance-none rounded-md border px-2 pr-7 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-50"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <template v-for="(o, i) in options" :key="i">
        <optgroup v-if="isGroup(o)" :label="o.label">
          <option v-for="c in o.options" :key="c.value" :value="c.value" :disabled="c.disabled">
            {{ c.label }}
          </option>
        </optgroup>
        <option v-else :value="o.value" :disabled="o.disabled">{{ o.label }}</option>
      </template>
    </select>
    <svg
      class="text-mute pointer-events-none absolute top-1/2 right-2 h-3 w-3 -translate-y-1/2"
      viewBox="0 0 12 12"
      fill="none"
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </div>
</template>
