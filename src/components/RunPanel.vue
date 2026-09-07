<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NProgress, NScrollbar, NTag, useMessage } from 'naive-ui'
import { useRunStore } from '../stores/run'
import { useAssetsStore } from '../stores/assets'
import type { ProducedFile } from '../types/job'

const { t } = useI18n()
const store = useRunStore()
const assetsStore = useAssetsStore()
const message = useMessage()

const statusLabel = computed(() => {
  switch (store.status) {
    case 'loading': return t('run.loadingCore')
    case 'running': return t('run.segment', { current: store.segmentIndex + 1, total: store.segmentTotal })
    case 'done': return t('run.done')
    case 'failed': return t('run.failed')
    case 'cancelled': return t('run.cancelled')
    default: return ''
  }
})

const statusType = computed(() => {
  switch (store.status) {
    case 'done': return 'success'
    case 'failed': return 'error'
    case 'cancelled': return 'warning'
    default: return 'info'
  }
})

// auto-scroll logs
const logBox = ref<HTMLElement | null>(null)
watch(() => store.logs.length, async () => {
  await nextTick()
  logBox.value?.scrollTo({ top: logBox.value.scrollHeight })
})

// preview / download
const previews = ref<Record<string, string>>({})
function previewUrl(f: ProducedFile): string {
  if (!previews.value[f.filename]) {
    previews.value[f.filename] = URL.createObjectURL(new Blob([f.data.buffer as ArrayBuffer]))
  }
  return previews.value[f.filename]
}
const previewing = ref<string | null>(null)

function download(f: ProducedFile) {
  const a = document.createElement('a')
  a.href = previewUrl(f)
  a.download = f.filename
  a.click()
}

const isPlayable = (f: ProducedFile) => /\.(mp4|webm|mkv|mp3|aac|wav|ogg|flac|png|jpe?g|gif|webp)$/i.test(f.filename)
const isImage = (f: ProducedFile) => /\.(png|jpe?g|gif|webp)$/i.test(f.filename)
const isAudio = (f: ProducedFile) => /\.(mp3|aac|wav|ogg|flac)$/i.test(f.filename)

async function saveToAssets(f: ProducedFile) {
  const ext = f.filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? ''
  const mime =
    f.kind === 'output' || f.kind === 'stage'
      ? guessMime(ext)
      : 'application/octet-stream'
  await assetsStore.upload(new File([f.data.buffer as ArrayBuffer], f.filename, { type: mime }))
  message.success(t('run.savedToAssets'))
}
function guessMime(ext: string): string {
  if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) return `video/${ext === 'mkv' ? 'x-matroska' : ext}`
  if (['mp3', 'aac', 'wav', 'ogg', 'flac'].includes(ext)) return `audio/${ext === 'mp3' ? 'mpeg' : ext}`
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`
  return 'application/octet-stream'
}
</script>

<template>
  <div class="run">
    <div class="run__title">{{ t('run.title') }}</div>

    <div v-if="store.status !== 'idle'" class="run__status">
      <NTag :type="statusType" size="small">{{ statusLabel }}</NTag>
      <NProgress
        v-if="store.running && store.segmentTotal > 0"
        type="line"
        :percentage="Math.round((((store.segmentIndex) + store.segmentRatio) / store.segmentTotal) * 100)"
        :height="10"
        processing
      />
      <div v-if="store.error" class="run__error">{{ store.error }}</div>
    </div>

    <template v-if="store.outputs.length">
      <div class="run__section">{{ t('run.outputs') }}</div>
      <div v-for="f in store.outputs" :key="f.nodeId + f.filename" class="run__output">
        <div class="run__output-head">
          <NTag size="tiny" :type="f.kind === 'output' ? 'success' : 'info'" :bordered="false">
            {{ f.kind === 'output' ? t('run.outputFile') : t('run.stageFile') }}
          </NTag>
          <span class="run__output-name">{{ f.filename }}</span>
        </div>
        <div class="run__output-actions">
          <NButton v-if="isPlayable(f)" size="tiny" @click="previewing = previewing === f.filename ? null : f.filename">
            {{ t('run.preview') }}
          </NButton>
          <NButton size="tiny" @click="download(f)">{{ t('run.download') }}</NButton>
          <NButton size="tiny" @click="saveToAssets(f)">{{ t('run.saveToAssets') }}</NButton>
        </div>
        <div v-if="previewing === f.filename" class="run__preview">
          <img v-if="isImage(f)" :src="previewUrl(f)" alt="" />
          <audio v-else-if="isAudio(f)" :src="previewUrl(f)" controls />
          <video v-else :src="previewUrl(f)" controls />
        </div>
      </div>
    </template>

    <template v-if="store.logs.length">
      <div class="run__section">{{ t('run.logs') }}</div>
      <div ref="logBox" class="run__logs">
        <NScrollbar style="max-height: 240px">
          <pre>{{ store.logs.join('\n') }}</pre>
        </NScrollbar>
      </div>
    </template>
  </div>
</template>

<style scoped>
.run { display: flex; flex-direction: column; gap: 8px; }
.run__title { font-weight: 700; font-size: 13px; }
.run__status { display: flex; flex-direction: column; gap: 6px; }
.run__error { color: #ef4444; font-size: 12px; }
.run__section { font-size: 12px; color: #9ca3af; margin-top: 6px; }
.run__output { background: #1c1c22; border: 1px solid #33333d; border-radius: 6px; padding: 6px 8px; display: flex; flex-direction: column; gap: 6px; }
.run__output-head { display: flex; gap: 6px; align-items: center; }
.run__output-name { font-size: 12px; word-break: break-all; }
.run__output-actions { display: flex; gap: 6px; }
.run__preview video, .run__preview img { max-width: 100%; border-radius: 4px; }
.run__preview audio { width: 100%; }
.run__logs { background: #0b0b0e; border-radius: 6px; padding: 8px; }
.run__logs pre { margin: 0; font-size: 10px; color: #9ca3af; white-space: pre-wrap; word-break: break-all; }
</style>
