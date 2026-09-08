<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{ show: boolean; title?: string }>();
const emit = defineEmits<{ (e: "update:show", v: boolean): void }>();

const panel = ref<HTMLElement>();
let prevFocus: Element | null = null;

function close() {
  emit("update:show", false);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}

watch(
  () => props.show,
  async (v) => {
    if (v) {
      prevFocus = document.activeElement;
      document.addEventListener("keydown", onKeydown);
      await nextTick();
      panel.value?.focus();
    } else {
      document.removeEventListener("keydown", onKeydown);
      (prevFocus as HTMLElement | null)?.focus?.();
      prevFocus = null;
    }
  },
);
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @mousedown.self="close"
    >
      <div
        ref="panel"
        v-bind="$attrs"
        tabindex="-1"
        class="border-line bg-panel flex max-h-[85vh] w-full flex-col rounded-lg border shadow-xl outline-none"
      >
        <div class="border-line flex flex-none items-center justify-between border-b px-4 py-3">
          <span class="text-fg text-sm font-semibold">{{ title }}</span>
          <button type="button" class="text-mute hover:text-fg cursor-pointer" @click="close">
            ✕
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <slot />
        </div>
        <div
          v-if="$slots.footer"
          class="border-line flex flex-none justify-end gap-2 border-t px-4 py-3"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
