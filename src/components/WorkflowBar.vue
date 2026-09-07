<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton, NDropdown, NInput, NModal, NList, NListItem, NPopconfirm, useMessage,
} from 'naive-ui'
import { useWorkflowStore } from '../stores/workflow'
import { useGraphStore } from '../stores/graph'

const { t } = useI18n()
const store = useWorkflowStore()
const graphStore = useGraphStore()
const message = useMessage()

const showManager = ref(false)
const showSaveAs = ref(false)
const saveAsName = ref('')

onMounted(() => void store.refresh())

const menuOptions = [
  { label: () => t('workflow.new'), key: 'new' },
  { label: () => t('workflow.save'), key: 'save' },
  { label: () => t('workflow.saveAs'), key: 'saveAs' },
  { label: () => t('workflow.manage'), key: 'manage' },
  { label: () => t('workflow.export'), key: 'export' },
  { label: () => t('workflow.import'), key: 'import' },
]

async function onMenu(key: string) {
  switch (key) {
    case 'new': store.newWorkflow(); break
    case 'save': await store.save(); message.success(t('workflow.saved')); break
    case 'saveAs': saveAsName.value = graphStore.name || ''; showSaveAs.value = true; break
    case 'manage': showManager.value = true; break
    case 'export': doExport(); break
    case 'import': fileInput.value?.click(); break
  }
}

function doExport() {
  const text = store.exportCurrent()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = `${graphStore.name || 'workflow'}.ffmpeg-webui.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

const fileInput = ref<HTMLInputElement | null>(null)
async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    store.importFromText(await file.text())
    message.success(t('workflow.imported'))
  } catch (err) {
    message.error(t('workflow.importFailed', { msg: err instanceof Error ? err.message : String(err) }))
  }
}

async function doSaveAs() {
  if (!saveAsName.value.trim()) return
  await store.saveAs(saveAsName.value.trim())
  showSaveAs.value = false
  message.success(t('workflow.saved'))
}

const fmtTime = (ts: number) => new Date(ts).toLocaleString()
</script>

<template>
  <div class="wfbar">
    <NInput
      v-model:value="graphStore.name"
      size="small"
      :placeholder="t('workflow.untitled')"
      style="width: 200px"
    />
    <NDropdown trigger="click" :options="menuOptions" @select="onMenu">
      <NButton size="small">☰</NButton>
    </NDropdown>
    <input ref="fileInput" type="file" accept=".json" hidden @change="onImportFile" />

    <NModal v-model:show="showSaveAs" preset="dialog" :title="t('workflow.saveAs')">
      <NInput v-model:value="saveAsName" :placeholder="t('workflow.name')" />
      <template #action>
        <NButton size="small" type="primary" @click="doSaveAs">{{ t('workflow.save') }}</NButton>
      </template>
    </NModal>

    <NModal v-model:show="showManager" preset="card" :title="t('workflow.manage')" style="max-width: 560px">
      <NList bordered>
        <NListItem v-for="w in store.saved" :key="w.id">
          <div class="wfrow">
            <div>
              <div>{{ w.name }}</div>
              <div class="wfrow__time">{{ t('workflow.updatedAt') }} {{ fmtTime(w.updatedAt) }}</div>
            </div>
            <div class="wfrow__actions">
              <NButton size="tiny" @click="store.open(w.id); showManager = false">{{ t('workflow.load') }}</NButton>
              <NPopconfirm @positive-click="store.remove(w.id)">
                <template #trigger>
                  <NButton size="tiny" type="error" quaternary>{{ t('workflow.delete') }}</NButton>
                </template>
                {{ t('workflow.deleteConfirm', { name: w.name }) }}
              </NPopconfirm>
            </div>
          </div>
        </NListItem>
      </NList>
    </NModal>
  </div>
</template>

<style scoped>
.wfbar { display: flex; gap: 6px; align-items: center; }
.wfrow { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.wfrow__time { font-size: 11px; color: #6b7280; }
.wfrow__actions { display: flex; gap: 6px; }
</style>
