<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: "default" | "success" | "error" | "warning" | "info";
    size?: "tiny" | "small";
  }>(),
  { type: "default", size: "small" },
);

const types: Record<string, string> = {
  default: "bg-white/10 text-fg2",
  success: "bg-ok/15 text-ok",
  error: "bg-danger/15 text-danger",
  warning: "bg-warn/15 text-warn",
  info: "bg-accent/15 text-accent",
};
const sizes: Record<string, string> = {
  tiny: "rounded px-1 text-[10px] leading-4",
  small: "rounded px-1.5 text-[11px] leading-5",
};
</script>

<template>
  <span :class="['inline-block whitespace-nowrap', types[type], sizes[size]]">
    <slot />
  </span>
</template>
