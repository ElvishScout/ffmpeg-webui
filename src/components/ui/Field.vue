<script setup lang="ts">
defineProps<{ label?: string }>();
</script>

<template>
  <div class="block">
    <div v-if="label || $slots.label" class="text-mute mb-1 text-xs">
      <slot name="label">{{ label }}</slot>
    </div>
    <slot />
  </div>
</template>
