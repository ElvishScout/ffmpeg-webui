<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NInput, NButton } from 'naive-ui'
import { FILTER_REGISTRY, FILTER_CATEGORIES, SPECIAL_NODES } from '../../filters/registry'
import { useGraphStore } from '../../stores/graph'

const { t, locale } = useI18n()
const store = useGraphStore()
const search = ref('')
const collapsed = ref<Set<string>>(new Set(FILTER_CATEGORIES))

function toggle(cat: string) {
  if (collapsed.value.has(cat)) collapsed.value.delete(cat)
  else collapsed.value.add(cat)
}

/** One uniform item shape for both special nodes and filters. */
interface PaletteItem {
  name: string
  desc?: { zh: string; en: string }
  special?: (typeof SPECIAL_NODES)[number]['kind']
}

const filtered = computed<{ cat: string; items: PaletteItem[] }[]>(() => {
  const q = search.value.trim().toLowerCase()
  const match = (name: string, d?: { zh: string; en: string }) =>
    !q || name.includes(q) || d?.zh.toLowerCase().includes(q) || d?.en.toLowerCase().includes(q)
  const groups = FILTER_CATEGORIES.map((cat) => ({
    cat,
    items: FILTER_REGISTRY.filter((f) => f.category === cat && match(f.name, f.desc)),
  })).filter((g) => g.items.length > 0)
  const specialItems = SPECIAL_NODES.filter((s) => match(s.name, s.desc)).map((s) => ({
    name: s.name,
    desc: s.desc,
    special: s.kind,
  }))
  return specialItems.length ? [{ cat: 'special', items: specialItems }, ...groups] : groups
})

function add(item: PaletteItem) {
  if (!item.special) {
    store.addNode({ kind: 'filter', filterName: item.name, params: {} })
  } else if (item.special === 'raw') {
    store.addNode({ kind: 'raw', rawFilter: '', rawInputs: ['video'], rawOutputs: ['video'] })
  } else if (item.special === 'source') {
    store.addNode({ kind: 'source', sourceFilter: '', sourceOutputs: ['video'] })
  } else {
    store.addNode({ kind: item.special, preset: 'high', filename: '' })
  }
}

function onDragStart(event: DragEvent, item: PaletteItem) {
  const payload = item.special
    ? { type: 'special', kind: item.special }
    : { type: 'filter', name: item.name }
  event.dataTransfer?.setData('application/ffmpeg-webui', JSON.stringify(payload))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

const desc = (d?: { zh: string; en: string }) => (locale.value === 'zh' ? d?.zh : d?.en)
</script>

<template>
  <div class="palette">
    <NInput v-model:value="search" size="small" :placeholder="t('palette.search')" clearable />

    <div class="palette__cats">
      <div v-for="g in filtered" :key="g.cat" class="pf-group">
        <div class="pf-group__header" @click="toggle(g.cat)">
          <span class="pf-group__arrow" :class="{ open: !collapsed.has(g.cat) }">▸</span>
          <span>{{ g.cat === 'special' ? t('palette.special') : t(`palette.categories.${g.cat}`) }}</span>
        </div>
        <template v-if="!collapsed.has(g.cat)">
          <div class="pf-items">
            <NButton
              v-for="item in g.items"
              :key="item.name"
              size="tiny"
              tertiary
              class="pf-item"
              :title="desc(item.desc)"
              draggable
              @dragstart="onDragStart($event, item)"
              @click="add(item)"
            >
              {{ item.name }}<span v-if="item.desc" class="pf-item__desc">{{ desc(item.desc) }}</span>
            </NButton>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
}
.palette > .n-input { margin: 0 10px 2px; width: auto; }
.palette__cats {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 6px; /* scrollbar stays at the sidebar edge, items stay inset */
}
.pf-group__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 4px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 5px;
  color: #c7c7d1;
}
.pf-group__header:hover { background: #26262e; }
.pf-group__arrow {
  font-size: 10px;
  color: #6b7280;
  transition: transform 0.15s;
}
.pf-group__arrow.open { transform: rotate(90deg); }
.pf-items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 4px 4px 20px;
}
.pf-item {
  cursor: pointer; /* click-to-add is the primary gesture; drag uses its own ghost */
  max-width: 100%;
}
.pf-item :deep(.n-button__content) {
  min-width: 0; /* allow shrink; no overflow:hidden here or descenders get clipped */
}
.pf-item__desc {
  font-size: 11px;
  color: #8a8a94;
  margin-left: 4px;
  min-width: 0;
  flex: 0 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
