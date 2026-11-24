<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{ variant?: 'info' | 'warning' | 'error' | 'success'; title?: string }>(), {
  variant: 'info',
  title: '',
})
</script>

<template>
  <div class="alert" :class="`alert--${variant}`" :role="variant === 'error' ? 'alert' : 'status'">
    <AppIcon :name="variant === 'info' || variant === 'success' ? 'info' : 'alert'" :size="18" />
    <div class="alert__body">
      <strong v-if="title" class="alert__title">{{ title }}</strong>
      <span><slot /></span>
    </div>
    <div v-if="$slots.action" class="alert__action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
}

.alert__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 0.1rem;
}

.alert__title {
  font-weight: 700;
}

.alert__action {
  flex: none;
}

.alert :deep(svg) {
  margin-top: 0.15rem;
}

.alert--info {
  background: var(--info-soft);
  border-color: color-mix(in srgb, var(--info) 35%, transparent);
}
.alert--info :deep(svg) {
  color: var(--info);
}

.alert--warning {
  background: var(--warning-soft);
  border-color: color-mix(in srgb, var(--warning) 40%, transparent);
}
.alert--warning :deep(svg) {
  color: var(--warning);
}

.alert--error {
  background: var(--danger-soft);
  border-color: color-mix(in srgb, var(--danger) 45%, transparent);
}
.alert--error :deep(svg) {
  color: var(--danger);
}

.alert--success {
  background: var(--success-soft);
  border-color: color-mix(in srgb, var(--success) 40%, transparent);
}
.alert--success :deep(svg) {
  color: var(--success);
}
</style>
