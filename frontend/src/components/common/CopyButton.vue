<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { copyToClipboard } from '@/services/clipboard'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ value: string; label: string; disabled?: boolean }>()
const emit = defineEmits<{ error: [message: string] }>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  try {
    await copyToClipboard(props.value)
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), 1800)
  } catch (e) {
    emit('error', e instanceof Error ? e.message : 'Kopieren fehlgeschlagen.')
  }
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <button type="button" class="btn btn--ghost btn--icon btn--sm" :disabled="disabled" :aria-label="label" :title="label" @click="copy">
    <AppIcon :name="copied ? 'check' : 'copy'" :size="18" />
    <span class="sr-only" role="status">{{ copied ? 'In die Zwischenablage kopiert' : '' }}</span>
  </button>
</template>
