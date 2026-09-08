<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Modal from "./ui/Modal.vue";
import Button from "./ui/Button.vue";
import { useGraphStore } from "../stores/graph";
import type { UploadNode } from "../types/graph";

/** Pre-run file collection: one multi-file picker per upload node in the graph. */
const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{
  (e: "update:show", v: boolean): void;
  (e: "confirm", files: Record<string, File[]>): void;
}>();

const { t } = useI18n();
const store = useGraphStore();

const uploads = computed(() => store.nodes.filter((n): n is UploadNode => n.kind === "upload"));
const picked = ref<Record<string, File[]>>({});
watch(
  () => props.show,
  (v) => {
    if (v) picked.value = {};
  },
);

const acceptOf = (n: UploadNode) => String(n.params?.accept ?? "").trim() || undefined;
const allReady = computed(
  () =>
    uploads.value.length > 0 && uploads.value.every((n) => (picked.value[n.id]?.length ?? 0) > 0),
);

function onPick(id: string, e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length) picked.value = { ...picked.value, [id]: files };
  input.value = "";
}

function start() {
  emit("confirm", picked.value);
  emit("update:show", false);
}
</script>

<template>
  <Modal
    :show="show"
    :title="t('upload.title')"
    style="max-width: 520px"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <p class="upload__hint">{{ t("upload.hint") }}</p>
    <div v-for="n in uploads" :key="n.id" class="upload__row">
      <div class="upload__row-head">
        <span class="upload__name">upload</span>
        <span class="upload__count">{{ t("upload.count", { n: picked[n.id]?.length ?? 0 }) }}</span>
      </div>
      <label class="upload__pick">
        <Button tag="span" size="small">{{ t("upload.pick") }}</Button>
        <input type="file" hidden multiple :accept="acceptOf(n)" @change="onPick(n.id, $event)" />
      </label>
      <div v-if="picked[n.id]?.length" class="upload__files">
        {{ picked[n.id].map((f) => f.name).join(", ") }}
      </div>
    </div>
    <template #footer>
      <Button size="small" @click="emit('update:show', false)">{{ t("common.cancel") }}</Button>
      <Button size="small" variant="primary" :disabled="!allReady" @click="start">
        {{ t("upload.start") }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.upload__hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #9ca3af;
}
.upload__row {
  border: 1px solid #33333d;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.upload__row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.upload__name {
  font-weight: 700;
  font-size: 13px;
}
.upload__count {
  font-size: 12px;
  color: #9ca3af;
}
.upload__pick {
  display: inline-block;
}
.upload__files {
  font-size: 12px;
  color: #9ca3af;
  word-break: break-all;
}
</style>
