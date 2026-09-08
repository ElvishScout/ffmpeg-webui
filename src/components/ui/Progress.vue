<script setup lang="ts">
withDefaults(defineProps<{ percentage: number; processing?: boolean; height?: number }>(), {
  height: 10,
});
</script>

<template>
  <div class="bg-card w-full overflow-hidden rounded-full" :style="{ height: `${height}px` }">
    <div
      class="bg-accent h-full rounded-full transition-[width] duration-200"
      :class="processing ? 'ui-progress-processing' : ''"
      :style="{ width: `${Math.min(100, Math.max(0, percentage))}%` }"
    />
  </div>
</template>

<style scoped>
.ui-progress-processing {
  background-image: linear-gradient(
    45deg,
    rgb(255 255 255 / 25%) 25%,
    transparent 25%,
    transparent 50%,
    rgb(255 255 255 / 25%) 50%,
    rgb(255 255 255 / 25%) 75%,
    transparent 75%
  );
  background-size: 16px 16px;
  animation: ui-progress-stripes 0.8s linear infinite;
}
@keyframes ui-progress-stripes {
  from {
    background-position: 16px 0;
  }
  to {
    background-position: 0 0;
  }
}
</style>
