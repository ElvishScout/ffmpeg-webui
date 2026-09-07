<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NModal, NButton, NAlert, useMessage } from 'naive-ui'
import { useGraphStore } from '../stores/graph'
import { jobToCommands } from '../compiler/compile'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>()

const { t } = useI18n()
const store = useGraphStore()
const message = useMessage()

const result = computed(() => (props.show ? store.compile() : null))
const commands = computed(() => (result.value?.job ? jobToCommands(result.value.job) : []))

async function copyAll() {
  await navigator.clipboard.writeText(commands.value.join('\n\n'))
  message.success(t('command.copied'))
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('command.title')"
    style="max-width: 760px"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NAlert v-if="!commands.length" type="warning">{{ t('command.invalid') }}</NAlert>
    <div v-for="(cmd, i) in commands" :key="i" class="cmd">
      <div class="cmd__label">{{ t('command.segmentLabel', { n: i + 1 }) }}</div>
      <pre class="cmd__text">{{ cmd }}</pre>
    </div>
    <template v-if="commands.length" #footer>
      <NButton size="small" @click="copyAll">{{ t('command.copy') }}</NButton>
    </template>
  </NModal>
</template>

<style scoped>
.cmd { margin-bottom: 12px; }
.cmd__label { font-size: 11px; color: #9ca3af; margin-bottom: 4px; }
.cmd__text {
  background: #0b0b0e; padding: 10px; border-radius: 6px;
  font-size: 12px; white-space: pre-wrap; word-break: break-all; margin: 0;
}
</style>
