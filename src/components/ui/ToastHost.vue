<script setup lang="ts">
import { toasts } from "./toast";
</script>

<template>
  <div
    class="pointer-events-none fixed top-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
  >
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        role="status"
        class="rounded-md border px-3 py-2 text-xs shadow-lg"
        :class="
          t.type === 'success'
            ? 'border-ok/40 text-ok bg-[#12241a]'
            : 'border-danger/40 text-danger bg-[#2a1518]'
        "
      >
        {{ t.text }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
