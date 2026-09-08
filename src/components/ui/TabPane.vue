<script setup lang="ts">
import { computed, inject, onBeforeUnmount } from "vue";
import { tabsKey, type PaneInfo } from "./tabs-context";

const props = defineProps<{ name: string; tab: string }>();

const ctx = inject(tabsKey);
if (!ctx) throw new Error("TabPane must be used inside Tabs");

// getter 形式注册,tab 文案随 props(语言切换)更新
const info: PaneInfo = {
  get name() {
    return props.name;
  },
  get tab() {
    return props.tab;
  },
};
ctx.register(info);
onBeforeUnmount(() => ctx.unregister(props.name));

const active = computed(() => ctx.activeName.value === props.name);
</script>

<template>
  <div v-show="active" class="h-full overflow-y-auto">
    <slot />
  </div>
</template>
