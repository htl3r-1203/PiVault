<script setup lang="ts">
// Modaler Dialog auf Basis des nativen <dialog>-Elements: Fokusfalle, Esc und inerter
// Hintergrund kommen vom Browser. Der Inhalt wird nur gerendert, solange der Dialog offen ist.
import { nextTick, onMounted, ref, useId, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{ open: boolean; title: string; variant?: 'center' | 'side'; closeLabel?: string }>(),
  { variant: 'center', closeLabel: 'Schließen' },
)
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const titleId = useId()

async function sync() {
  await nextTick()
  const el = dialog.value
  if (!el) return
  if (props.open && !el.open) el.showModal()
  else if (!props.open && el.open) el.close()
}

watch(() => props.open, sync)
onMounted(sync)

// Esc: Schließen läuft über den Besitzer, damit Zustand und Dialog nie auseinanderlaufen
function onCancel(event: Event) {
  event.preventDefault()
  emit('close')
}

// Klick auf den abgedunkelten Hintergrund
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) emit('close')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="dialog"
    :class="`dialog--${variant}`"
    :aria-labelledby="titleId"
    @cancel="onCancel"
    @click="onClick"
  >
    <div v-if="open" class="dialog__panel">
      <header class="dialog__header">
        <h2 :id="titleId" class="dialog__title">{{ title }}</h2>
        <button type="button" class="btn btn--ghost btn--icon btn--sm" :aria-label="closeLabel" @click="emit('close')">
          <AppIcon name="close" :size="18" />
        </button>
      </header>
      <div class="dialog__body"><slot /></div>
      <footer v-if="$slots.footer" class="dialog__footer"><slot name="footer" /></footer>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  padding: 0;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dialog::backdrop {
  background: var(--scrim);
}

.dialog[open] {
  display: flex;
  flex-direction: column;
}

.dialog__panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

/* Zentrierter Dialog */
.dialog--center {
  width: min(32rem, calc(100vw - 2rem));
  max-height: min(46rem, calc(100dvh - 2rem));
  border-radius: var(--radius-lg);
}

.dialog--center[open] {
  animation: dialog-in 160ms ease;
}

/* Seitenpanel (Detailansicht); auf kleinen Bildschirmen vollflächig */
.dialog--side {
  width: min(30rem, 100vw);
  height: 100dvh;
  max-height: 100dvh;
  margin: 0 0 0 auto;
  border-width: 0 0 0 1px;
  border-radius: 0;
}

.dialog--side[open] {
  animation: slide-in 200ms ease;
}

.dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.dialog__title {
  font-size: 1.1rem;
  overflow-wrap: anywhere;
}

.dialog__body {
  flex: 1;
  min-height: 0;
  padding: var(--space-5);
  overflow-y: auto;
}

.dialog__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
}
</style>
