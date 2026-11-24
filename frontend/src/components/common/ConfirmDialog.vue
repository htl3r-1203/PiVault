<script setup lang="ts">
import BaseDialog from './BaseDialog.vue'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    confirmLabel?: string
    cancelLabel?: string
    busy?: boolean
    error?: string
    danger?: boolean
  }>(),
  { confirmLabel: 'Bestätigen', cancelLabel: 'Abbrechen', busy: false, error: '', danger: false },
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <BaseDialog :open="open" :title="title" @close="emit('cancel')">
    <div class="confirm__text"><slot /></div>
    <p v-if="error" class="field__error confirm__error" role="alert">{{ error }}</p>
    <template #footer>
      <button type="button" class="btn" :disabled="busy" @click="emit('cancel')">{{ cancelLabel }}</button>
      <button
        type="button"
        class="btn"
        :class="danger ? 'btn--danger' : 'btn--primary'"
        :disabled="busy"
        @click="emit('confirm')"
      >
        {{ busy ? 'Bitte warten …' : confirmLabel }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.confirm__text {
  color: var(--text-muted);
}

.confirm__error {
  margin-top: var(--space-3);
}
</style>
