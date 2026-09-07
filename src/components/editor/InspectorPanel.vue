<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NForm, NFormItem, NInput, NInputNumber, NSelect, NButton, NTag, NAlert, NList, NListItem,
} from 'naive-ui'
import { useGraphStore } from '../../stores/graph'
import { useAssetsStore } from '../../stores/assets'
import { filterByName } from '../../filters/registry'
import { nodeDisplayName } from '../../compiler/validate'
import { matchCandidates } from '../../data/match'
import ParamField from './ParamField.vue'
import type { PortType } from '../../types/filter'

const { t, locale } = useI18n()
const store = useGraphStore()
const assetsStore = useAssetsStore()

const node = computed(() => store.nodes.find((n) => n.id === store.selectedId) ?? null)
const spec = computed(() =>
  node.value?.kind === 'filter' && node.value.filterName
    ? filterByName.get(node.value.filterName)
    : undefined,
)

const presetOptions = computed(() => [
  { value: 'lossless', label: t('inspector.presetLossless') },
  { value: 'high', label: t('inspector.presetHigh') },
  { value: 'fast', label: t('inspector.presetFast') },
  { value: 'copy', label: t('inspector.presetCopy') },
])

function setParam(key: string, value: unknown) {
  if (!node.value) return
  store.updateParam(node.value.id, key, value)
  // keep dynamic pad counts in sync with the count param
  if (spec.value?.inputsFrom === key) {
    store.updateNode(node.value.id, { inputCount: Number(value) })
  }
  if (spec.value?.outputsFrom === key) {
    store.updateNode(node.value.id, { outputCount: Number(value) })
  }
}

// --- raw node pad editors ---
const portOptions = computed(() => [
  { value: 'video', label: t('inspector.rawPortVideo') },
  { value: 'audio', label: t('inspector.rawPortAudio') },
])
function setRawPads(which: 'rawInputs' | 'rawOutputs', pads: PortType[]) {
  if (node.value) store.updateNode(node.value.id, { [which]: pads })
}

// --- asset ghost remap ---
const remapFile = ref<File | null>(null)
const missingRef = computed(() => {
  if (node.value?.kind !== 'asset' || !node.value.assetRef) return null
  return store.missingAssetIds.has(node.value.assetRef.id) ? node.value.assetRef : null
})
const candidates = computed(() =>
  missingRef.value ? matchCandidates(missingRef.value, assetsStore.assets) : [],
)
function remapTo(assetId: string) {
  const meta = assetsStore.byId.get(assetId)
  if (!meta || !missingRef.value) return
  store.remapAsset(missingRef.value.id, {
    id: meta.id, filename: meta.filename, size: meta.size, mime: meta.mime,
  })
}
async function remapToFile(file: File | null) {
  if (!file || !missingRef.value) return
  const meta = await assetsStore.upload(file)
  store.remapAsset(missingRef.value.id, {
    id: meta.id, filename: meta.filename, size: meta.size, mime: meta.mime,
  })
  remapFile.value = null
}

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  void remapToFile(input.files?.[0] ?? null)
  input.value = ''
}

const assetMeta = computed(() =>
  node.value?.kind === 'asset' && node.value.assetRef
    ? assetsStore.byId.get(node.value.assetRef.id)
    : undefined,
)

const fmtSize = (n: number) =>
  n > 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`
</script>

<template>
  <div class="inspector">
    <div class="inspector__title">{{ t('inspector.title') }}</div>
    <div v-if="!node" class="inspector__empty">{{ t('inspector.empty') }}</div>

    <template v-else>
      <div class="inspector__kind">{{ nodeDisplayName(node) }}</div>

      <!-- asset -->
      <template v-if="node.kind === 'asset'">
        <NAlert v-if="missingRef" type="warning" :title="t('node.missing')">
          <div class="remap">
            <p>{{ t('assets.remapHint') }}</p>
            <NList v-if="candidates.length" size="small" bordered>
              <NListItem v-for="c in candidates" :key="c.id">
                {{ c.filename }} ({{ fmtSize(c.size) }})
                <template #suffix>
                  <NButton size="tiny" @click="remapTo(c.id)">{{ t('assets.remap') }}</NButton>
                </template>
              </NListItem>
            </NList>
            <label class="file-pick">
              <NButton size="small">{{ t('assets.upload') }}</NButton>
              <input type="file" hidden @change="onFilePicked" />
            </label>
          </div>
        </NAlert>
        <template v-else>
          <NForm v-if="assetMeta" size="small" label-placement="top">
            <NFormItem :label="t('inspector.assetInfo')">
              <div class="asset-info">
                <NTag size="small">{{ t(`assets.type${assetMeta.kind[0].toUpperCase()}${assetMeta.kind.slice(1)}`) }}</NTag>
                <div>{{ assetMeta.filename }}</div>
                <div>{{ fmtSize(assetMeta.size) }}</div>
                <div v-if="assetMeta.duration">{{ t('assets.duration') }}: {{ assetMeta.duration.toFixed(2) }}s</div>
                <div v-if="assetMeta.width">{{ t('assets.resolution') }}: {{ assetMeta.width }}×{{ assetMeta.height }}</div>
              </div>
            </NFormItem>
          </NForm>
          <NForm size="small" label-placement="top">
            <NFormItem>
              <template #label>-ss <span class="param-desc">{{ t('inspector.inputSSHint') }}</span></template>
              <NInput :value="node.inputSS ?? ''" placeholder="10 或 00:00:10" @update:value="(v: string) => store.updateNode(node!.id, { inputSS: v })" />
            </NFormItem>
            <NFormItem>
              <template #label>-t <span class="param-desc">{{ t('inspector.inputTHint') }}</span></template>
              <NInput :value="node.inputT ?? ''" placeholder="5" @update:value="(v: string) => store.updateNode(node!.id, { inputT: v })" />
            </NFormItem>
            <NFormItem>
              <template #label>-stream_loop <span class="param-desc">{{ t('inspector.streamLoopHint') }}</span></template>
              <NInputNumber :value="node.streamLoop" :placeholder="t('inspector.unset')" @update:value="(v: number | null) => store.updateNode(node!.id, { streamLoop: v ?? undefined })" />
            </NFormItem>
            <NFormItem>
              <template #label>{{ t('inspector.vStream') }}</template>
              <NInputNumber :value="node.vStream ?? 0" :min="0" @update:value="(v: number | null) => store.updateNode(node!.id, { vStream: v ?? 0 })" />
            </NFormItem>
            <NFormItem>
              <template #label>{{ t('inspector.aStream') }}</template>
              <NInputNumber :value="node.aStream ?? 0" :min="0" @update:value="(v: number | null) => store.updateNode(node!.id, { aStream: v ?? 0 })" />
            </NFormItem>
          </NForm>
        </template>
      </template>

      <!-- source -->
      <NForm v-else-if="node.kind === 'source'" size="small" label-placement="top">
        <NFormItem :label="t('inspector.sourceFilter')">
          <NInput
            :value="node.sourceFilter ?? ''"
            type="textarea"
            :autosize="{ minRows: 2 }"
            placeholder="color=c=black:s=1280x720:d=5"
            @update:value="(v: string) => store.updateNode(node!.id, { sourceFilter: v })"
          />
        </NFormItem>
        <NFormItem :label="t('inspector.rawOutputs')">
          <div class="pads">
            <div v-for="(p, i) in node.sourceOutputs ?? []" :key="i" class="pads__row">
              <NSelect
                :value="p" size="small" :options="portOptions" style="width: 110px"
                @update:value="(v: PortType) => { const arr = [...(node!.sourceOutputs ?? [])]; arr[i] = v; store.updateNode(node!.id, { sourceOutputs: arr }) }"
              />
              <NButton size="tiny" quaternary @click="store.updateNode(node!.id, { sourceOutputs: (node!.sourceOutputs ?? []).filter((_, j) => j !== i) })">✕</NButton>
            </div>
            <NButton size="tiny" dashed @click="store.updateNode(node!.id, { sourceOutputs: [...(node!.sourceOutputs ?? []), 'video'] })">+</NButton>
          </div>
        </NFormItem>
      </NForm>

      <!-- filter -->
      <NForm v-else-if="node.kind === 'filter' && spec" size="small" label-placement="top">
        <NFormItem v-for="p in spec.params" :key="p.key">
          <template #label>
            {{ p.key }}
            <span v-if="p.desc" class="param-desc">{{ locale === 'zh' ? p.desc.zh : p.desc.en }}</span>
          </template>
          <ParamField
            :spec="p"
            :value="node.params?.[p.key]"
            @update="(v: unknown) => setParam(p.key, v)"
          />
        </NFormItem>
      </NForm>

      <!-- raw -->
      <NForm v-else-if="node.kind === 'raw'" size="small" label-placement="top">
        <NFormItem :label="t('inspector.rawFilter')">
          <NInput
            :value="node.rawFilter ?? ''"
            type="textarea"
            :autosize="{ minRows: 2 }"
            placeholder="hue=h=90:s=1.5"
            @update:value="(v: string) => store.updateNode(node!.id, { rawFilter: v })"
          />
        </NFormItem>
        <NFormItem :label="t('inspector.rawInputs')">
          <div class="pads">
            <div v-for="(p, i) in node.rawInputs ?? []" :key="i" class="pads__row">
              <NSelect
                :value="p" size="small" :options="portOptions" style="width: 110px"
                @update:value="(v: PortType) => { const arr = [...(node!.rawInputs ?? [])]; arr[i] = v; setRawPads('rawInputs', arr) }"
              />
              <NButton size="tiny" quaternary @click="setRawPads('rawInputs', (node!.rawInputs ?? []).filter((_, j) => j !== i))">✕</NButton>
            </div>
            <NButton size="tiny" dashed @click="setRawPads('rawInputs', [...(node!.rawInputs ?? []), 'video'])">+</NButton>
          </div>
        </NFormItem>
        <NFormItem :label="t('inspector.rawOutputs')">
          <div class="pads">
            <div v-for="(p, i) in node.rawOutputs ?? []" :key="i" class="pads__row">
              <NSelect
                :value="p" size="small" :options="portOptions" style="width: 110px"
                @update:value="(v: PortType) => { const arr = [...(node!.rawOutputs ?? [])]; arr[i] = v; setRawPads('rawOutputs', arr) }"
              />
              <NButton size="tiny" quaternary @click="setRawPads('rawOutputs', (node!.rawOutputs ?? []).filter((_, j) => j !== i))">✕</NButton>
            </div>
            <NButton size="tiny" dashed @click="setRawPads('rawOutputs', [...(node!.rawOutputs ?? []), 'video'])">+</NButton>
          </div>
        </NFormItem>
      </NForm>

      <!-- stage / output -->
      <NForm v-else-if="node.kind === 'stage' || node.kind === 'output'" size="small" label-placement="top">
        <NFormItem :label="t('inspector.filename')">
          <NInput
            :value="node.filename ?? ''"
            :placeholder="node.kind === 'stage' ? 'mid.mkv' : 'output.mp4'"
            @update:value="(v: string) => store.updateNode(node!.id, { filename: v })"
          />
        </NFormItem>
        <NFormItem :label="t('inspector.preset')">
          <NSelect
            :value="node.preset ?? 'high'"
            :options="presetOptions"
            @update:value="(v: string) => store.updateNode(node!.id, { preset: v as never })"
          />
        </NFormItem>
        <NFormItem :label="t('inspector.audioPads')">
          <NInputNumber
            :value="node.audioPads ?? 1" :min="0" :max="8"
            @update:value="(v: number | null) => store.updateNode(node!.id, { audioPads: v ?? 1 })"
          />
        </NFormItem>
        <NFormItem>
          <template #label>
            {{ t('inspector.advancedArgs') }}
            <span class="param-desc">{{ t('inspector.advancedArgsHint') }}</span>
          </template>
          <NInput
            :value="node.advancedArgs ?? ''"
            placeholder="-movflags +faststart"
            @update:value="(v: string) => store.updateNode(node!.id, { advancedArgs: v })"
          />
        </NFormItem>
      </NForm>

      <NButton class="inspector__delete" size="small" type="error" secondary @click="store.removeNode(node.id)">
        {{ t('inspector.delete') }}
      </NButton>
    </template>
  </div>
</template>

<style scoped>
.inspector { display: flex; flex-direction: column; gap: 8px; }
.inspector__title { font-weight: 700; font-size: 13px; }
.inspector__empty { color: #6b7280; font-size: 12px; }
.inspector__kind { font-size: 12px; color: #9ca3af; }
.inspector__delete { margin-top: 12px; }
.param-desc { color: #6b7280; font-size: 11px; margin-left: 6px; }
.asset-info { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.remap { display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
.file-pick { display: inline-block; }
.pads { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.pads__row { display: flex; gap: 6px; align-items: center; }
</style>
