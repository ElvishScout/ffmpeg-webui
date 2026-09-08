<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import Field from "../ui/Field.vue";
import Input from "../ui/Input.vue";
import InputNumber from "../ui/InputNumber.vue";
import Select from "../ui/Select.vue";
import Button from "../ui/Button.vue";
import Tag from "../ui/Tag.vue";
import Alert from "../ui/Alert.vue";
import { useGraphStore } from "../../stores/graph";
import { useAssetsStore } from "../../stores/assets";
import { filterByName, sourceByName, specialByKind } from "../../specs/registry";
import { nodeDisplayName } from "../../compiler/validate";
import { FORMATS, formatOf } from "../../compiler/formats";
import { matchCandidates } from "../../data/match";
import ParamField from "./ParamField.vue";
import InputOptionsFields from "./InputOptionsFields.vue";
import type { PortType } from "../../types/filter";
import type { EncodePreset, OutputFormat } from "../../types/graph";

const { t, locale } = useI18n();
const store = useGraphStore();
const assetsStore = useAssetsStore();

const node = computed(() => store.nodes.find((n) => n.id === store.selectedId) ?? null);
const spec = computed(() =>
  node.value?.kind === "filter" && node.value.filterName
    ? filterByName.get(node.value.filterName)
    : undefined,
);
const sourceSpec = computed(() =>
  node.value?.kind === "source" && node.value.filterName
    ? sourceByName.get(node.value.filterName)
    : undefined,
);
const specialSpec = computed(() =>
  node.value?.kind === "upload" || node.value?.kind === "glob"
    ? specialByKind.get(node.value.kind)
    : undefined,
);

// --- stage / output: format × strategy (orthogonal) ---
const sinkNode = computed(() =>
  node.value && (node.value.kind === "stage" || node.value.kind === "output") ? node.value : null,
);
const sinkFormat = computed<OutputFormat>(() =>
  sinkNode.value ? formatOf(sinkNode.value) : "mp4",
);

const formatOptions = computed(() => {
  const group = (labelKey: string, formats: OutputFormat[]) => ({
    label: t(labelKey),
    options: formats.map((f) => ({
      value: f,
      label: t(`inspector.format_${f}`),
    })),
  });
  return [
    group("inspector.formatGroupVideo", ["mp4", "mkv", "webm", "hevc", "prores"]),
    group("inspector.formatGroupAudio", ["mp3", "m4a", "flac", "wav", "opus"]),
    group("inspector.formatGroupImage", ["gif", "apng"]),
  ];
});

const presetOptions = computed(() => {
  const applicable = FORMATS[sinkFormat.value].presets;
  if (!applicable.length) return [];
  const label = (p: string) => t(`inspector.preset${p[0].toUpperCase()}${p.slice(1)}`);
  return [
    { value: "", label: t("inspector.presetDefault") },
    ...applicable.map((p) => ({ value: p, label: label(p) })),
  ];
});

function setFormat(v: OutputFormat) {
  const sink = sinkNode.value;
  if (!sink) return;
  const patch: { format: OutputFormat; preset?: EncodePreset; filename?: string } = {
    format: v,
  };
  // reset a strategy the new format doesn't support (e.g. lossless on webm)
  if (sink.preset && !FORMATS[v].presets.includes(sink.preset)) {
    patch.preset = undefined;
  }
  // follow the format's default extension unless the user picked a custom one
  const fn = sink.filename ?? "";
  const oldExt = FORMATS[sinkFormat.value].ext;
  const newExt = FORMATS[v].ext;
  const m = fn.match(/^(.*)\.([a-z0-9]{2,5})$/i);
  if (m && m[2].toLowerCase() === oldExt && oldExt !== newExt) {
    patch.filename = `${m[1]}.${newExt}`;
  }
  store.updateNode(sink.id, patch);
}

function setParam(key: string, value: unknown) {
  if (!node.value) return;
  store.updateParam(node.value.id, key, value);
  // keep dynamic pad counts in sync with the count param
  if (spec.value?.inputsFrom === key) {
    store.updateNode(node.value.id, { inputCount: Number(value) });
  }
  if (spec.value?.outputsFrom === key) {
    store.updateNode(node.value.id, { outputCount: Number(value) });
  }
}

// --- raw node pad editors ---
const portOptions = computed(() => [
  { value: "video", label: t("inspector.rawPortVideo") },
  { value: "audio", label: t("inspector.rawPortAudio") },
]);
function setRawPads(which: "rawInputs" | "rawOutputs", pads: PortType[]) {
  if (!node.value) return;
  store.updateNode(
    node.value.id,
    which === "rawInputs" ? { rawInputs: pads } : { rawOutputs: pads },
  );
}
function updateRawPad(which: "rawInputs" | "rawOutputs", i: number, v: PortType) {
  if (node.value?.kind !== "raw") return;
  const arr = [...(node.value[which] ?? [])];
  arr[i] = v;
  setRawPads(which, arr);
}
function removeRawPad(which: "rawInputs" | "rawOutputs", i: number) {
  if (node.value?.kind !== "raw") return;
  setRawPads(
    which,
    (node.value[which] ?? []).filter((_, j) => j !== i),
  );
}
function addRawPad(which: "rawInputs" | "rawOutputs") {
  if (node.value?.kind !== "raw") return;
  setRawPads(which, [...(node.value[which] ?? []), "video"]);
}

// --- generic source output pad editors ---
function setSourcePads(pads: PortType[]) {
  if (node.value?.kind === "source") store.updateNode(node.value.id, { sourceOutputs: pads });
}
function updateSourcePad(i: number, v: PortType) {
  if (node.value?.kind !== "source") return;
  const arr = [...(node.value.sourceOutputs ?? [])];
  arr[i] = v;
  setSourcePads(arr);
}
function removeSourcePad(i: number) {
  if (node.value?.kind !== "source") return;
  setSourcePads((node.value.sourceOutputs ?? []).filter((_, j) => j !== i));
}
function addSourcePad() {
  if (node.value?.kind !== "source") return;
  setSourcePads([...(node.value.sourceOutputs ?? []), "video"]);
}

// --- asset ghost remap ---
const remapFile = ref<File | null>(null);
const missingRef = computed(() => {
  if (node.value?.kind !== "asset" || !node.value.assetRef) return null;
  return store.missingAssetIds.has(node.value.assetRef.id) ? node.value.assetRef : null;
});
const candidates = computed(() =>
  missingRef.value ? matchCandidates(missingRef.value, assetsStore.assets) : [],
);
function remapTo(assetId: string) {
  const meta = assetsStore.byId.get(assetId);
  if (!meta || !missingRef.value) return;
  store.remapAsset(missingRef.value.id, {
    id: meta.id,
    filename: meta.filename,
    size: meta.size,
    mime: meta.mime,
  });
}
async function remapToFile(file: File | null) {
  if (!file || !missingRef.value) return;
  const meta = await assetsStore.upload(file);
  store.remapAsset(missingRef.value.id, {
    id: meta.id,
    filename: meta.filename,
    size: meta.size,
    mime: meta.mime,
  });
  remapFile.value = null;
}

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement;
  void remapToFile(input.files?.[0] ?? null);
  input.value = "";
}

const assetMeta = computed(() =>
  node.value?.kind === "asset" && node.value.assetRef
    ? assetsStore.byId.get(node.value.assetRef.id)
    : undefined,
);

const fmtSize = (n: number) =>
  n > 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;
</script>

<template>
  <div class="inspector">
    <div v-if="!node" class="inspector__empty">{{ t("inspector.empty") }}</div>

    <template v-else>
      <div class="inspector__title">{{ nodeDisplayName(node) }}</div>

      <!-- asset -->
      <template v-if="node.kind === 'asset'">
        <Alert v-if="missingRef" type="warning" :title="t('node.missing')">
          <div class="remap">
            <p class="m-0">{{ t("assets.remapHint") }}</p>
            <div
              v-if="candidates.length"
              class="divide-line-soft border-line divide-y rounded-md border"
            >
              <div
                v-for="c in candidates"
                :key="c.id"
                class="flex items-center justify-between gap-2 px-2.5 py-1.5"
              >
                <span class="min-w-0 truncate">{{ c.filename }} ({{ fmtSize(c.size) }})</span>
                <Button size="tiny" @click="remapTo(c.id)">{{ t("assets.remap") }}</Button>
              </div>
            </div>
            <label class="file-pick">
              <Button tag="span" size="small">{{ t("assets.upload") }}</Button>
              <input type="file" hidden @change="onFilePicked" />
            </label>
          </div>
        </Alert>
        <template v-else>
          <div v-if="assetMeta" class="flex flex-col gap-3">
            <Field :label="t('inspector.assetInfo')">
              <div class="asset-info">
                <Tag size="small">{{
                  t(`assets.type${assetMeta.kind[0].toUpperCase()}${assetMeta.kind.slice(1)}`)
                }}</Tag>
                <div>{{ assetMeta.filename }}</div>
                <div>{{ fmtSize(assetMeta.size) }}</div>
                <div v-if="assetMeta.duration">
                  {{ t("assets.duration") }}: {{ assetMeta.duration.toFixed(2) }}s
                </div>
                <div v-if="assetMeta.width">
                  {{ t("assets.resolution") }}: {{ assetMeta.width }}×{{ assetMeta.height }}
                </div>
              </div>
            </Field>
          </div>
          <InputOptionsFields :node="node" />
        </template>
      </template>

      <!-- source -->
      <div v-else-if="node.kind === 'source'" class="flex flex-col gap-3">
        <template v-if="sourceSpec">
          <Field v-for="p in sourceSpec.params" :key="p.key">
            <template #label>
              {{ p.key }}
              <span v-if="p.desc" class="param-desc">{{
                locale === "zh" ? p.desc.zh : p.desc.en
              }}</span>
            </template>
            <ParamField
              :spec="p"
              :value="node.params?.[p.key]"
              @update="(v: unknown) => setParam(p.key, v)"
            />
          </Field>
        </template>
        <template v-else>
          <Field :label="t('inspector.sourceFilter')">
            <Input
              :model-value="node.sourceFilter ?? ''"
              type="textarea"
              placeholder="color=c=black:s=1280x720:d=5"
              @update:model-value="(v: string) => store.updateNode(node!.id, { sourceFilter: v })"
            />
          </Field>
          <Field :label="t('inspector.rawOutputs')">
            <div class="pads">
              <div v-for="(p, i) in node.sourceOutputs ?? []" :key="i" class="pads__row">
                <Select
                  :model-value="p"
                  :options="portOptions"
                  style="width: 110px"
                  @update:model-value="(v: string) => updateSourcePad(i, v as PortType)"
                />
                <Button size="tiny" variant="ghost" @click="removeSourcePad(i)">✕</Button>
              </div>
              <div>
                <Button size="tiny" dashed @click="addSourcePad()">+</Button>
              </div>
            </div>
          </Field>
        </template>
      </div>

      <!-- filter -->
      <div v-else-if="node.kind === 'filter' && spec" class="flex flex-col gap-3">
        <Field v-for="p in spec.params" :key="p.key">
          <template #label>
            {{ p.key }}
            <span v-if="p.desc" class="param-desc">{{
              locale === "zh" ? p.desc.zh : p.desc.en
            }}</span>
          </template>
          <ParamField
            :spec="p"
            :value="node.params?.[p.key]"
            @update="(v: unknown) => setParam(p.key, v)"
          />
        </Field>
      </div>

      <!-- raw -->
      <div v-else-if="node.kind === 'raw'" class="flex flex-col gap-3">
        <Field :label="t('inspector.rawFilter')">
          <Input
            :model-value="node.rawFilter ?? ''"
            type="textarea"
            placeholder="hue=h=90:s=1.5"
            @update:model-value="(v: string) => store.updateNode(node!.id, { rawFilter: v })"
          />
        </Field>
        <Field :label="t('inspector.rawInputs')">
          <div class="pads">
            <div v-for="(p, i) in node.rawInputs ?? []" :key="i" class="pads__row">
              <Select
                :model-value="p"
                :options="portOptions"
                style="width: 110px"
                @update:model-value="(v: string) => updateRawPad('rawInputs', i, v as PortType)"
              />
              <Button size="tiny" variant="ghost" @click="removeRawPad('rawInputs', i)">✕</Button>
            </div>
            <div>
              <Button size="tiny" dashed @click="addRawPad('rawInputs')">+</Button>
            </div>
          </div>
        </Field>
        <Field :label="t('inspector.rawOutputs')">
          <div class="pads">
            <div v-for="(p, i) in node.rawOutputs ?? []" :key="i" class="pads__row">
              <Select
                :model-value="p"
                :options="portOptions"
                style="width: 110px"
                @update:model-value="(v: string) => updateRawPad('rawOutputs', i, v as PortType)"
              />
              <Button size="tiny" variant="ghost" @click="removeRawPad('rawOutputs', i)">✕</Button>
            </div>
            <div>
              <Button size="tiny" dashed @click="addRawPad('rawOutputs')">+</Button>
            </div>
          </div>
        </Field>
      </div>

      <!-- upload -->
      <div v-else-if="node.kind === 'upload'" class="flex flex-col gap-3">
        <Field v-for="p in specialSpec?.params ?? []" :key="p.key">
          <template #label>
            {{ p.key }}
            <span v-if="p.desc" class="param-desc">{{
              locale === "zh" ? p.desc.zh : p.desc.en
            }}</span>
          </template>
          <ParamField
            :spec="p"
            :value="node.params?.[p.key]"
            @update="(v: unknown) => setParam(p.key, v)"
          />
        </Field>
        <InputOptionsFields :node="node" />
      </div>

      <!-- glob -->
      <div v-else-if="node.kind === 'glob'" class="flex flex-col gap-3">
        <Field v-for="p in specialSpec?.params ?? []" :key="p.key">
          <template #label>
            {{ p.key }}
            <span v-if="p.desc" class="param-desc">{{
              locale === "zh" ? p.desc.zh : p.desc.en
            }}</span>
          </template>
          <ParamField
            :spec="p"
            :value="node.params?.[p.key]"
            @update="(v: unknown) => setParam(p.key, v)"
          />
        </Field>
      </div>

      <!-- stage / output -->
      <div v-else-if="node.kind === 'stage' || node.kind === 'output'" class="flex flex-col gap-3">
        <Field :label="t('inspector.filename')">
          <Input
            :model-value="node.filename ?? ''"
            :placeholder="`${node.kind === 'stage' ? 'mid' : 'output'}.${FORMATS[sinkFormat].ext}`"
            @update:model-value="(v: string) => store.updateNode(node!.id, { filename: v })"
          />
        </Field>
        <Field :label="t('inspector.format')">
          <Select
            :model-value="sinkFormat"
            :options="formatOptions"
            @update:model-value="(v: string) => setFormat(v as OutputFormat)"
          />
        </Field>
        <Field v-if="presetOptions.length" :label="t('inspector.preset')">
          <Select
            :model-value="node.preset ?? ''"
            :options="presetOptions"
            @update:model-value="
              (v: string) =>
                store.updateNode(node!.id, {
                  preset: (v || undefined) as never,
                })
            "
          />
        </Field>
        <Field v-if="sinkFormat === 'gif'" :label="t('inspector.gifFps')">
          <InputNumber
            :model-value="node.gifFps ?? 15"
            :min="1"
            :max="60"
            @update:model-value="
              (v: number | null) => store.updateNode(node!.id, { gifFps: v ?? undefined })
            "
          />
        </Field>
        <Field v-if="sinkFormat === 'gif'" :label="t('inspector.gifWidth')">
          <InputNumber
            :model-value="node.gifWidth ?? 480"
            :min="16"
            :max="3840"
            @update:model-value="
              (v: number | null) => store.updateNode(node!.id, { gifWidth: v ?? undefined })
            "
          />
        </Field>
        <Field :label="t('inspector.audioPads')">
          <InputNumber
            :model-value="node.audioPads ?? 1"
            :min="0"
            :max="8"
            @update:model-value="
              (v: number | null) => store.updateNode(node!.id, { audioPads: v ?? 1 })
            "
          />
        </Field>
        <Field>
          <template #label>
            {{ t("inspector.advancedArgs") }}
            <span class="param-desc">{{ t("inspector.advancedArgsHint") }}</span>
          </template>
          <Input
            :model-value="node.advancedArgs ?? ''"
            placeholder="-movflags +faststart"
            @update:model-value="(v: string) => store.updateNode(node!.id, { advancedArgs: v })"
          />
        </Field>
      </div>

      <Button class="mt-3" size="small" danger @click="store.removeNode(node.id)">
        {{ t("inspector.delete") }}
      </Button>
    </template>
  </div>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.inspector__title {
  font-weight: 700;
  font-size: 13px;
}
.inspector__empty {
  color: #6b7280;
  font-size: 12px;
}
.param-desc {
  color: #6b7280;
  font-size: 12px;
  margin-left: 6px;
}
.asset-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.remap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.file-pick {
  display: inline-block;
}
.pads {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.pads__row {
  display: flex;
  gap: 6px;
  align-items: center;
}
</style>
