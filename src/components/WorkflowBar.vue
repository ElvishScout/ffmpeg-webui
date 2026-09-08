<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Button from "./ui/Button.vue";
import Dropdown from "./ui/Dropdown.vue";
import Input from "./ui/Input.vue";
import Modal from "./ui/Modal.vue";
import Popconfirm from "./ui/Popconfirm.vue";
import { toast } from "./ui/toast";
import { useWorkflowStore } from "../stores/workflow";
import { useGraphStore } from "../stores/graph";

const { t } = useI18n();
const store = useWorkflowStore();
const graphStore = useGraphStore();

const showManager = ref(false);
const showSaveAs = ref(false);
const saveAsName = ref("");

onMounted(() => void store.refresh());

const menuOptions = [
  { label: () => t("workflow.new"), key: "new" },
  { label: () => t("workflow.save"), key: "save" },
  { label: () => t("workflow.saveAs"), key: "saveAs" },
  { label: () => t("workflow.manage"), key: "manage" },
  { label: () => t("workflow.export"), key: "export" },
  { label: () => t("workflow.import"), key: "import" },
];

async function onMenu(key: string) {
  switch (key) {
    case "new":
      store.newWorkflow();
      break;
    case "save":
      await store.save();
      toast.success(t("workflow.saved"));
      break;
    case "saveAs":
      saveAsName.value = graphStore.name || "";
      showSaveAs.value = true;
      break;
    case "manage":
      showManager.value = true;
      break;
    case "export":
      doExport();
      break;
    case "import":
      fileInput.value?.click();
      break;
  }
}

function doExport() {
  const text = store.exportCurrent();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = `${graphStore.name || "workflow"}.ffmpeg-webui.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const fileInput = ref<HTMLInputElement | null>(null);
async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    store.importFromText(await file.text());
    toast.success(t("workflow.imported"));
  } catch (err) {
    toast.error(
      t("workflow.importFailed", {
        msg: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function doSaveAs() {
  if (!saveAsName.value.trim()) return;
  await store.saveAs(saveAsName.value.trim());
  showSaveAs.value = false;
  toast.success(t("workflow.saved"));
}

const fmtTime = (ts: number) => new Date(ts).toLocaleString();
</script>

<template>
  <div class="wfbar">
    <Input v-model="graphStore.name" :placeholder="t('workflow.untitled')" style="width: 200px" />
    <Dropdown :options="menuOptions" @select="onMenu">
      <Button size="small">☰</Button>
    </Dropdown>
    <input ref="fileInput" type="file" accept=".json" hidden @change="onImportFile" />

    <Modal v-model:show="showSaveAs" :title="t('workflow.saveAs')" style="max-width: 420px">
      <Input v-model="saveAsName" :placeholder="t('workflow.name')" />
      <template #footer>
        <Button size="small" variant="primary" @click="doSaveAs">{{ t("workflow.save") }}</Button>
      </template>
    </Modal>

    <Modal v-model:show="showManager" :title="t('workflow.manage')" style="max-width: 560px">
      <div
        v-if="store.saved.length"
        class="divide-line-soft border-line divide-y rounded-md border"
      >
        <div v-for="w in store.saved" :key="w.id" class="px-3 py-2">
          <div class="wfrow">
            <div>
              <div>{{ w.name }}</div>
              <div class="wfrow__time">
                {{ t("workflow.updatedAt") }} {{ fmtTime(w.updatedAt) }}
              </div>
            </div>
            <div class="wfrow__actions">
              <Button
                size="tiny"
                @click="
                  store.open(w.id);
                  showManager = false;
                "
                >{{ t("workflow.load") }}</Button
              >
              <Popconfirm @positive="store.remove(w.id)">
                <template #trigger>
                  <Button size="tiny" variant="ghost" danger>{{ t("workflow.delete") }}</Button>
                </template>
                {{ t("workflow.deleteConfirm", { name: w.name }) }}
              </Popconfirm>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="wfempty">{{ t("workflow.empty") }}</div>
    </Modal>
  </div>
</template>

<style scoped>
.wfbar {
  display: flex;
  gap: 6px;
  align-items: center;
}
.wfrow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.wfrow__time {
  font-size: 11px;
  color: #6b7280;
}
.wfrow__actions {
  display: flex;
  gap: 6px;
}
.wfempty {
  color: #6b7280;
  font-size: 12px;
}
</style>
