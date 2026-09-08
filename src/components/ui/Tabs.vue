<script setup lang="ts">
import { provide, ref, toRef } from "vue";
import { tabsKey, type PaneInfo } from "./tabs-context";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();

const panes = ref<PaneInfo[]>([]);

provide(tabsKey, {
  activeName: toRef(props, "modelValue"),
  register: (p) => {
    if (!panes.value.some((x) => x.name === p.name)) panes.value.push(p);
  },
  unregister: (name) => {
    panes.value = panes.value.filter((x) => x.name !== name);
  },
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="border-line flex flex-none gap-3 border-b px-2.5">
      <button
        v-for="p in panes"
        :key="p.name"
        type="button"
        class="-mb-px cursor-pointer border-b-2 px-1 py-2 text-xs transition-colors"
        :class="
          p.name === modelValue
            ? 'border-accent text-fg'
            : 'text-mute hover:text-fg2 border-transparent'
        "
        @click="emit('update:modelValue', p.name)"
      >
        {{ p.tab }}
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-hidden pt-2">
      <slot />
    </div>
  </div>
</template>
