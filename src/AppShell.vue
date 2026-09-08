<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import Button from "./components/ui/Button.vue";
import Select from "./components/ui/Select.vue";
import Alert from "./components/ui/Alert.vue";
import Tabs from "./components/ui/Tabs.vue";
import TabPane from "./components/ui/TabPane.vue";
import { toast } from "./components/ui/toast";
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
  get: () => i18n.global.locale.value as string,
  set: (v: string) => setLocale(v as Locale),
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
    rightTab.value = "outputs";
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
  }
}
</script>

<template>
  <div class="app">
    <header class="app__bar">
      <span class="app__title">{{ t("app.title") }}</span>
      <WorkflowBar />
      <div class="app__spacer" />
      <Select
        v-model="runStore.backendId"
        style="width: 200px"
        :options="backendOptions"
        :title="t('app.backend')"
      />
      <Button size="small" :disabled="!graphStore.validation.ok" @click="showCommand = true">
        {{ t("app.commandPreview") }}
      </Button>
      <Button
        v-if="!runStore.running"
        size="small"
        variant="primary"
        :disabled="!graphStore.validation.ok"
        @click="onRun"
      >
        {{ t("app.run") }}
      </Button>
      <Button v-else size="small" variant="primary" danger @click="runStore.cancel()">
        {{ t("app.cancel") }}
      </Button>
      <Select v-model="currentLocale" style="width: 100px" :options="localeOptions" />
    </header>

    <Alert v-if="!sabSupported" type="error" class="rounded-none">
      {{ t("errors.sabUnsupported") }}
    </Alert>

    <div v-if="validationMessages.length" class="app__errors">
      <span v-for="(m, i) in validationMessages" :key="i" class="app__error">⚠ {{ m }}</span>
    </div>

    <main class="app__main">
      <aside class="app__left">
        <Tabs v-model="leftTab">
          <TabPane name="nodes" :tab="t('palette.title')">
            <NodePalette />
          </TabPane>
          <TabPane name="assets" :tab="t('assets.title')">
            <AssetPanel />
          </TabPane>
        </Tabs>
      </aside>
      <section class="app__canvas">
        <EditorCanvas />
      </section>
      <aside class="app__right">
        <Tabs v-model="rightTab">
          <TabPane name="inspector" :tab="t('inspector.title')">
            <div class="px-2.5 pb-3">
              <InspectorPanel />
            </div>
          </TabPane>
          <TabPane name="outputs" :tab="t('run.outputs')">
            <div class="h-full px-2.5 pb-3">
              <RunPanel view="outputs" />
            </div>
          </TabPane>
          <TabPane name="logs" :tab="t('run.logs')">
            <div class="h-full px-2.5 pb-3">
              <RunPanel view="logs" />
            </div>
          </TabPane>
        </Tabs>
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
  font-size: 15px;
}
.app__spacer {
  flex: 1;
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
  font-size: 12px;
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
  border-right: 1px solid #33333d;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.app__canvas {
  flex: 1;
  min-width: 0;
}
.app__right {
  width: 320px;
  flex: none;
  border-left: 1px solid #33333d;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
