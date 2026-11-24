<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

defineProps<{ icon: IconName; title: string }>()
</script>

<template>
  <div class="empty">
    <span class="empty__icon"><AppIcon :name="icon" :size="26" /></span>
    <h2 class="empty__title">{{ title }}</h2>
    <p class="empty__text"><slot /></p>
    <div v-if="$slots.action" class="empty__action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-7) var(--space-4);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  text-align: center;
}

.empty__icon {
  display: grid;
  place-items: center;
  width: 3.25rem;
  height: 3.25rem;
  margin-bottom: var(--space-2);
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}

.empty__text {
  max-width: 28rem;
  color: var(--text-muted);
  font-size: 0.925rem;
}

.empty__action {
  margin-top: var(--space-3);
}
</style>
