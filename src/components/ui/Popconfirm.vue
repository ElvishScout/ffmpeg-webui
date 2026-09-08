<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import Button from "./Button.vue";

const props = withDefaults(defineProps<{ placement?: "top" | "bottom" }>(), {
  placement: "top",
});
const emit = defineEmits<{ (e: "positive"): void }>();
const { t } = useI18n();

const open = ref(false);
const triggerEl = ref<HTMLElement>();
const panelEl = ref<HTMLElement>();
const pos = ref<{ top?: number; bottom?: number; right: number }>({ right: 0 });

const posStyle = computed(() => {
  const s: Record<string, string> = { right: `${pos.value.right}px` };
  if (pos.value.top != null) s.top = `${pos.value.top}px`;
  if (pos.value.bottom != null) s.bottom = `${pos.value.bottom}px`;
  return s;
});

function toggle() {
  if (open.value) {
    hide();
    return;
  }
  const el = triggerEl.value;
  if (el) {
    const r = el.getBoundingClientRect();
    const placeTop = props.placement === "top" && r.top >= 140;
    pos.value = placeTop
      ? { bottom: window.innerHeight - r.top + 6, right: window.innerWidth - r.right }
      : { top: r.bottom + 6, right: window.innerWidth - r.right };
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
  if (triggerEl.value?.contains(target) || panelEl.value?.contains(target)) return;
  hide();
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") hide();
}

function confirm() {
  hide();
  emit("positive");
}

onBeforeUnmount(hide);
</script>

<template>
  <span ref="triggerEl" class="inline-flex" @click="toggle">
    <slot name="trigger" />
  </span>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panelEl"
      class="border-line bg-panel fixed z-[70] w-56 rounded-md border p-3 shadow-xl"
      :style="posStyle"
    >
      <div class="text-fg2 mb-2.5 text-xs">
        <slot />
      </div>
      <div class="flex justify-end gap-2">
        <Button size="tiny" @click="hide">{{ t("common.cancel") }}</Button>
        <Button size="tiny" variant="primary" @click="confirm">{{ t("common.confirm") }}</Button>
      </div>
    </div>
  </Teleport>
</template>
