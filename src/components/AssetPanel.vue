<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { NButton, NTag, NEmpty, NPopconfirm, useMessage } from "naive-ui";
import { useAssetsStore } from "../stores/assets";
import { useGraphStore } from "../stores/graph";

const { t } = useI18n();
const store = useAssetsStore();
const graphStore = useGraphStore();
const message = useMessage();

onMounted(() => void store.refresh());

async function onFiles(files: FileList | File[]) {
  for (const f of files) {
    try {
      await store.upload(f);
    } catch (e) {
      message.error(String(e));
    }
  }
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) void onFiles(input.files);
  input.value = "";
}

function onDrop(e: DragEvent) {
  if (e.dataTransfer?.files?.length) void onFiles(e.dataTransfer.files);
}

function onDragStart(
  e: DragEvent,
  a: { id: string; filename: string; size: number; mime: string },
) {
  e.dataTransfer?.setData(
    "application/ffmpeg-webui",
    JSON.stringify({
      type: "asset",
      id: a.id,
      filename: a.filename,
      size: a.size,
      mime: a.mime,
    }),
  );
}

const fmtSize = (n: number) =>
  n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, n / 1024).toFixed(0)} KB`;

const kindLabel = (kind: string) => t(`assets.type${kind[0].toUpperCase()}${kind.slice(1)}`);
</script>

<template>
  <div class="assets" @drop.prevent="onDrop" @dragover.prevent>
    <label class="assets__upload">
      <NButton size="small" type="primary" dashed block tag="span">{{
        t("assets.upload")
      }}</NButton>
      <input type="file" hidden multiple @change="onPick" />
    </label>

    <NEmpty
      v-if="!store.assets.length"
      size="small"
      :description="t('assets.empty')"
      class="assets__empty"
    />

    <div class="assets__list">
      <div
        v-for="a in store.assets"
        :key="a.id"
        class="assets__item"
        draggable
        @dragstart="onDragStart($event, a)"
      >
        <div class="assets__info">
          <div class="assets__name" :title="a.filename">{{ a.filename }}</div>
          <div class="assets__meta">
            <NTag size="tiny" :bordered="false">{{ kindLabel(a.kind) }}</NTag>
            <span>{{ fmtSize(a.size) }}</span>
            <span v-if="a.duration">{{ a.duration.toFixed(1) }}s</span>
            <span v-if="a.width">{{ a.width }}×{{ a.height }}</span>
          </div>
        </div>
        <div class="assets__actions">
          <NButton
            size="tiny"
            quaternary
            :title="t('assets.addToCanvas')"
            @click="
              graphStore.addAssetNode({
                id: a.id,
                filename: a.filename,
                size: a.size,
                mime: a.mime,
              })
            "
            >＋</NButton
          >
          <NPopconfirm @positive-click="store.remove(a.id)">
            <template #trigger>
              <NButton size="tiny" quaternary type="error">✕</NButton>
            </template>
            {{ t("assets.deleteConfirm", { name: a.filename }) }}
          </NPopconfirm>
        </div>
      </div>
    </div>

    <div class="assets__quota">
      <span v-if="store.quota.quota">
        {{
          t("assets.quota", {
            used: fmtSize(store.quota.used),
            quota: fmtSize(store.quota.quota),
          })
        }}
      </span>
      <span v-else>{{ t("assets.quotaUnknown", { used: fmtSize(store.quota.used) }) }}</span>
    </div>
  </div>
</template>

<style scoped>
.assets {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding-top: 4px;
}
.assets__upload {
  display: block;
  margin: 0 10px 4px;
}
.assets__upload :deep(.n-button) {
  width: 100%;
}
.assets__empty {
  margin: 32px 10px 0;
}
.assets__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 10px; /* scrollbar stays at the sidebar edge */
}
.assets__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  background: #1c1c22;
  border: 1px solid #2c2c35;
  border-radius: 6px;
  cursor: grab;
}
.assets__item:hover {
  border-color: #3f3f4d;
}
.assets__info {
  min-width: 0;
  flex: 1;
}
.assets__name {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.assets__meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  color: #9ca3af;
  margin-top: 3px;
}
.assets__actions {
  display: flex;
  gap: 2px;
  flex: none;
}
.assets__quota {
  font-size: 11px;
  color: #6b7280;
  margin: 0 10px;
}
</style>
