<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import type { DropdownOption } from "./types";

defineProps<{ options: DropdownOption[] }>();
const emit = defineEmits<{ (e: "select", key: string): void }>();

const open = ref(false);
const triggerEl = ref<HTMLElement>();
const menuEl = ref<HTMLElement>();
const pos = ref({ top: 0, right: 0 });

function labelOf(o: DropdownOption) {
  // 函数标签在渲染时求值,语言切换后菜单文案随之更新
  return typeof o.label === "function" ? o.label() : o.label;
}

function toggle() {
  if (open.value) {
    hide();
    return;
  }
  const el = triggerEl.value;
  if (el) {
    const r = el.getBoundingClientRect();
    pos.value = { top: r.bottom + 4, right: window.innerWidth - r.right };
  }
  open.value = true;
  document.addEventListener("pointerdown", onOutside, true);
  document.addEventListener("keydown", onKey);
}

function hide() {
  open.value = false;
  document.removeEventListener("pointerdown", onOutside, true);
  document.removeEventListener("keydown", onKey);
}

function onOutside(e: Event) {
  const target = e.target as Node;
  if (triggerEl.value?.contains(target) || menuEl.value?.contains(target)) return;
  hide();
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") hide();
}

function choose(o: DropdownOption) {
  if (o.disabled) return;
  hide();
  emit("select", o.key);
}

onBeforeUnmount(hide);
</script>

<template>
  <span ref="triggerEl" class="inline-flex" @click="toggle">
    <slot />
  </span>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menuEl"
      class="border-line bg-panel fixed z-[70] min-w-32 rounded-md border py-1 shadow-xl"
      :style="{ top: `${pos.top}px`, right: `${pos.right}px` }"
    >
      <button
        v-for="o in options"
        :key="o.key"
        type="button"
        class="text-fg2 hover:text-fg block w-full cursor-pointer px-3 py-1.5 text-left text-xs hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="o.disabled"
        @click="choose(o)"
      >
        {{ labelOf(o) }}
      </button>
    </div>
  </Teleport>
</template>
