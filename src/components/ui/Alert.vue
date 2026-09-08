<script setup lang="ts">
withDefaults(defineProps<{ type?: "error" | "warning" | "info" | "success"; title?: string }>(), {
  type: "info",
});

const styles: Record<string, string> = {
  error: "border-danger/30 bg-danger/10",
  warning: "border-warn/30 bg-warn/10",
  info: "border-accent/30 bg-accent/10",
  success: "border-ok/30 bg-ok/10",
};
const titleColors: Record<string, string> = {
  error: "text-danger",
  warning: "text-warn",
  info: "text-accent",
  success: "text-ok",
};
</script>

<template>
  <div :class="['rounded-md border px-3 py-2 text-xs', styles[type]]">
    <div v-if="title" :class="['mb-1 font-semibold', titleColors[type]]">{{ title }}</div>
    <div class="text-fg2">
      <slot />
    </div>
  </div>
</template>
