<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import Modal from "./ui/Modal.vue";
import Button from "./ui/Button.vue";
import Alert from "./ui/Alert.vue";
import { toast } from "./ui/toast";
import { useGraphStore } from "../stores/graph";
import { jobToCommands } from "../compiler/compile";

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: "update:show", v: boolean): void }>();

const { t } = useI18n();
const store = useGraphStore();

// batch graphs have no static command: args are generated per iteration
const isBatch = computed(() => store.hasUploads);
const result = computed(() => (props.show && !isBatch.value ? store.compile() : null));
const commands = computed(() => (result.value?.job ? jobToCommands(result.value.job) : []));

async function copyAll() {
  await navigator.clipboard.writeText(commands.value.join("\n\n"));
  toast.success(t("command.copied"));
}
</script>

<template>
  <Modal
    :show="show"
    :title="t('command.title')"
    style="max-width: 760px"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <Alert v-if="isBatch" type="info">{{ t("command.batchNote") }}</Alert>
    <Alert v-else-if="!commands.length" type="warning">{{ t("command.invalid") }}</Alert>
    <template v-else>
      <div v-for="(cmd, i) in commands" :key="i" class="cmd">
        <div class="cmd__label">
          {{ t("command.segmentLabel", { n: i + 1 }) }}
        </div>
        <pre class="cmd__text">{{ cmd }}</pre>
      </div>
    </template>
    <template v-if="!isBatch && commands.length" #footer>
      <Button size="small" @click="copyAll">{{ t("command.copy") }}</Button>
    </template>
  </Modal>
</template>

<style scoped>
.cmd {
  margin-bottom: 12px;
}
.cmd__label {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 4px;
}
.cmd__text {
  background: #0b0b0e;
  padding: 10px;
  border-radius: 6px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
</style>
