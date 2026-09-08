<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import Button from "./ui/Button.vue";
import Progress from "./ui/Progress.vue";
import Tag from "./ui/Tag.vue";
import { toast } from "./ui/toast";
import { useRunStore } from "../stores/run";
import { useAssetsStore } from "../stores/assets";
import type { ProducedFile } from "../types/job";

const { t } = useI18n();
const store = useRunStore();
const assetsStore = useAssetsStore();

defineProps<{ view: "outputs" | "logs" }>();

const statusLabel = computed(() => {
  switch (store.status) {
    case "loading":
      return t("run.loadingCore");
    case "running": {
      const seg = t("run.segment", {
        current: store.segmentIndex + 1,
        total: store.segmentTotal,
      });
      return store.iterationTotal > 0
        ? `${t("run.iteration", { current: store.iterationIndex + 1, total: store.iterationTotal })} · ${seg}`
        : seg;
    }
    case "done":
      return t("run.done");
    case "failed":
      return t("run.failed");
    case "cancelled":
      return t("run.cancelled");
    default:
      return "";
  }
});

/** batch mode counts iterations × per-iteration segment progress; single run = segments only */
const progressPct = computed(() => {
  const segTotal = store.segmentTotal || 1;
  const segPart = (store.segmentIndex + store.segmentRatio) / segTotal;
  if (store.iterationTotal > 0) {
    return Math.round(((store.iterationIndex + segPart) / store.iterationTotal) * 100);
  }
  return Math.round(segPart * 100);
});

const statusType = computed(() => {
  switch (store.status) {
    case "done":
      return "success";
    case "failed":
      return "error";
    case "cancelled":
      return "warning";
    default:
      return "info";
  }
});

// auto-scroll logs
const logBox = ref<HTMLElement | null>(null);
watch(
  () => store.logs.length,
  async () => {
    await nextTick();
    logBox.value?.scrollTo({ top: logBox.value.scrollHeight });
  },
);

// preview / download
const previews = ref<Record<string, string>>({});
function previewUrl(f: ProducedFile): string {
  if (!previews.value[f.filename]) {
    previews.value[f.filename] = URL.createObjectURL(new Blob([f.data.buffer as ArrayBuffer]));
  }
  return previews.value[f.filename];
}
const previewing = ref<string | null>(null);

function download(f: ProducedFile) {
  const a = document.createElement("a");
  a.href = previewUrl(f);
  a.download = f.filename;
  a.click();
}

const isPlayable = (f: ProducedFile) =>
  /\.(mp4|webm|mkv|mov|mp3|m4a|aac|wav|ogg|opus|flac|png|jpe?g|gif|apng|webp)$/i.test(f.filename);
const isImage = (f: ProducedFile) => /\.(png|jpe?g|gif|apng|webp)$/i.test(f.filename);
const isAudio = (f: ProducedFile) => /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(f.filename);

async function saveToAssets(f: ProducedFile) {
  const ext = f.filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? "";
  const mime =
    f.kind === "output" || f.kind === "stage" ? guessMime(ext) : "application/octet-stream";
  await assetsStore.upload(new File([f.data.buffer as ArrayBuffer], f.filename, { type: mime }));
  toast.success(t("run.savedToAssets"));
}
function guessMime(ext: string): string {
  if (["mp4", "mkv", "webm", "mov", "avi"].includes(ext))
    return `video/${ext === "mkv" ? "x-matroska" : ext}`;
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "opus") return "audio/ogg";
  if (["aac", "wav", "ogg", "flac"].includes(ext)) return `audio/${ext}`;
  if (["png", "jpg", "jpeg", "gif", "apng", "webp"].includes(ext))
    return `image/${ext === "jpg" ? "jpeg" : ext}`;
  return "application/octet-stream";
}
</script>

<template>
  <div class="run">
    <div v-if="store.status !== 'idle'" class="run__status">
      <Tag :type="statusType" size="small">{{ statusLabel }}</Tag>
      <Progress
        v-if="store.running && store.segmentTotal > 0"
        :percentage="progressPct"
        processing
      />
      <div v-if="store.error" class="run__error">{{ store.error }}</div>
    </div>

    <template v-if="view === 'outputs'">
      <template v-if="store.outputs.length">
        <div v-for="f in store.outputs" :key="f.nodeId + f.filename" class="run__output">
          <div class="run__output-head">
            <Tag size="tiny" :type="f.kind === 'output' ? 'success' : 'info'">
              {{ f.kind === "output" ? t("run.outputFile") : t("run.stageFile") }}
            </Tag>
            <span class="run__output-name">{{ f.filename }}</span>
          </div>
          <div class="run__output-actions">
            <Button
              v-if="isPlayable(f)"
              size="tiny"
              @click="previewing = previewing === f.filename ? null : f.filename"
            >
              {{ t("run.preview") }}
            </Button>
            <Button size="tiny" @click="download(f)">{{ t("run.download") }}</Button>
            <Button size="tiny" @click="saveToAssets(f)">{{ t("run.saveToAssets") }}</Button>
          </div>
          <div v-if="previewing === f.filename" class="run__preview">
            <img v-if="isImage(f)" :src="previewUrl(f)" alt="" />
            <audio v-else-if="isAudio(f)" :src="previewUrl(f)" controls />
            <video v-else :src="previewUrl(f)" controls />
          </div>
        </div>
      </template>
      <div v-for="f in store.failures" :key="f.iteration" class="run__output">
        <div class="run__output-head">
          <Tag size="tiny" type="error">{{ t("run.failedTag") }}</Tag>
          <span class="run__output-name">
            {{ t("run.iteration", { current: f.iteration, total: store.iterationTotal }) }}:
            {{ f.files.join(" + ") }}
          </span>
        </div>
        <div class="run__error">{{ f.message }}</div>
      </div>
      <div v-if="!store.outputs.length && !store.failures.length" class="run__empty">
        {{ t("run.outputsEmpty") }}
      </div>
    </template>

    <template v-else>
      <div v-if="store.logs.length" ref="logBox" class="run__logs">
        <pre>{{ store.logs.join("\n") }}</pre>
      </div>
      <div v-else class="run__empty">{{ t("run.logsEmpty") }}</div>
    </template>
  </div>
</template>

<style scoped>
.run {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}
.run__empty {
  color: #6b7280;
  font-size: 12px;
}
.run__status {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.run__error {
  color: #ef4444;
  font-size: 13px;
}
.run__output {
  background: #1c1c22;
  border: 1px solid #33333d;
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.run__output-head {
  display: flex;
  gap: 6px;
  align-items: center;
}
.run__output-name {
  font-size: 13px;
  word-break: break-all;
}
.run__output-actions {
  display: flex;
  gap: 6px;
}
.run__preview video,
.run__preview img {
  max-width: 100%;
  border-radius: 4px;
}
.run__preview audio {
  width: 100%;
}
.run__logs {
  background: #0b0b0e;
  border-radius: 6px;
  padding: 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.run__logs pre {
  margin: 0;
  font-size: 10px;
  color: #9ca3af;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
