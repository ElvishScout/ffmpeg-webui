<script setup lang="ts">
defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    class="relative h-4 w-7 cursor-pointer rounded-full transition-colors"
    :class="modelValue ? 'bg-accent' : 'bg-line'"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      class="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform"
      :class="modelValue ? 'translate-x-3' : ''"
    />
  </button>
</template>
