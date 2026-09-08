<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { NButton, NSelect, NAlert, NTabs, NTabPane, useMessage } from "naive-ui";
import WorkflowBar from "./components/WorkflowBar.vue";
import AssetPanel from "./components/AssetPanel.vue";
import RunPanel from "./components/RunPanel.vue";
import CommandPreview from "./components/CommandPreview.vue";
import EditorCanvas from "./components/editor/EditorCanvas.vue";
import NodePalette from "./components/editor/NodePalette.vue";
import InspectorPanel from "./components/editor/InspectorPanel.vue";
import { useGraphStore } from "./stores/graph";
import { useRunStore } from "./stores/run";
import { i18n, setLocale, type Locale } from "./i18n";
import { sabSupported } from "./executor/wasm";
import { nodeDisplayName } from "./compiler/validate";

const { t } = useI18n();
const graphStore = useGraphStore();
const runStore = useRunStore();
const message = useMessage();

const showCommand = ref(false);
const rightTab = ref("inspector");
const leftTab = ref("nodes");

const backendOptions = computed(() => [
  { value: "wasm", label: t("app.backendWasm"), disabled: !sabSupported },
]);

const localeOptions = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];
const currentLocale = computed({
  get: () => i18n.global.locale.value as Locale,
  set: (v: Locale) => setLocale(v),
});

const validationMessages = computed(() =>
  graphStore.validation.errors.slice(0, 5).map((e) =>
    t(`validation.${e.code}`, {
      name:
        e.nodeName ??
        (e.nodeId ? nodeDisplayName(graphStore.nodes.find((n) => n.id === e.nodeId)!) : ""),
    }),
  ),
);

async function onRun() {
  try {
    await runStore.run();
    rightTab.value = "run";
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  }
}
</script>

<template>
  <div class="app">
    <header class="app__bar">
      <span class="app__title">{{ t("app.title") }}</span>
      <WorkflowBar />
      <div class="app__spacer" />
      <NSelect
        v-model:value="runStore.backendId"
        size="small"
        style="width: 200px"
        :options="backendOptions"
        :title="t('app.backend')"
      />
      <NButton size="small" :disabled="!graphStore.validation.ok" @click="showCommand = true">
        {{ t("app.commandPreview") }}
      </NButton>
      <NButton
        v-if="!runStore.running"
        size="small"
        type="primary"
        :disabled="!graphStore.validation.ok"
        @click="onRun"
      >
        {{ t("app.run") }}
      </NButton>
      <NButton v-else size="small" type="error" @click="runStore.cancel()">
        {{ t("app.cancel") }}
      </NButton>
      <NSelect
        v-model:value="currentLocale"
        size="small"
        style="width: 100px"
        :options="localeOptions"
      />
    </header>

    <NAlert v-if="!sabSupported" type="error" class="app__banner">
      {{ t("errors.sabUnsupported") }}
    </NAlert>

    <div v-if="validationMessages.length" class="app__errors">
      <span v-for="(m, i) in validationMessages" :key="i" class="app__error">⚠ {{ m }}</span>
    </div>

    <main class="app__main">
      <aside class="app__left">
        <NTabs
          v-model:value="leftTab"
          type="line"
          size="small"
          class="app__left-tabs"
          pane-wrapper-style="flex:1;min-height:0"
          pane-style="height:100%;overflow:hidden"
        >
          <NTabPane name="nodes" :tab="t('palette.title')">
            <NodePalette />
          </NTabPane>
          <NTabPane name="assets" :tab="t('assets.title')">
            <AssetPanel />
          </NTabPane>
        </NTabs>
      </aside>
      <section class="app__canvas">
        <EditorCanvas />
      </section>
      <aside class="app__right">
        <NTabs v-model:value="rightTab" type="line" size="small" class="app__tabs">
          <NTabPane name="inspector" :tab="t('inspector.title')">
            <InspectorPanel />
          </NTabPane>
          <NTabPane name="run" :tab="t('run.title')">
            <RunPanel />
          </NTabPane>
        </NTabs>
      </aside>
    </main>

    <CommandPreview v-model:show="showCommand" />
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.app__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #18181d;
  border-bottom: 1px solid #33333d;
}
.app__title {
  font-weight: 800;
  font-size: 14px;
}
.app__spacer {
  flex: 1;
}
.app__banner {
  border-radius: 0;
}
.app__errors {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  padding: 4px 12px;
  background: #2a1518;
  border-bottom: 1px solid #33333d;
}
.app__error {
  font-size: 11px;
  color: #f59e0b;
}
.app__main {
  flex: 1;
  display: flex;
  min-height: 0;
}
.app__left {
  width: 260px;
  flex: none;
  padding: 6px 0 10px;
  border-right: 1px solid #33333d;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.app__left-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.app__left-tabs :deep(.n-tabs-nav) {
  padding: 0 10px;
}
.app__left-tabs :deep(.n-tabs-pane-wrapper) {
  flex: 1;
  min-height: 0;
}
.app__canvas {
  flex: 1;
  min-width: 0;
}
.app__right {
  width: 320px;
  flex: none;
  border-left: 1px solid #33333d;
  overflow-y: auto;
  padding: 0 10px 10px;
}
.app__tabs {
  height: 100%;
}
</style>
