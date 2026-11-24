<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { VaultEntry } from '@/types/vault'
import { hostnameOf } from '@/utils/url'
import { initialOf } from '@/utils/format'

const props = defineProps<{ entry: VaultEntry; vaultName: string }>()
const emit = defineEmits<{ open: [id: string]; 'toggle-favorite': [id: string] }>()

// Feste Farbvarianten für die Avatare, abgeleitet vom Namen (nur CSS-Klassen, keine Inline-Styles)
const tone = computed(() => {
  let sum = 0
  for (const ch of props.entry.name) sum += ch.charCodeAt(0)
  return sum % 5
})
const host = computed(() => hostnameOf(props.entry.url))
</script>

<template>
  <li class="row">
    <button type="button" class="row__main" :aria-label="`${entry.name} öffnen`" @click="emit('open', entry.id)">
      <span class="row__avatar" :class="`row__avatar--${tone}`" aria-hidden="true">{{ initialOf(entry.name) }}</span>
      <span class="row__text">
        <span class="row__name">{{ entry.name }}</span>
        <span class="row__meta">
          <span>{{ entry.username || 'Kein Benutzername' }}</span>
          <span v-if="host" class="row__host">{{ host }}</span>
        </span>
      </span>
      <span class="badge row__vault">{{ vaultName }}</span>
    </button>
    <button
      type="button"
      class="btn btn--ghost btn--icon row__fav"
      :class="{ 'row__fav--on': entry.favorite }"
      :aria-pressed="entry.favorite"
      :aria-label="entry.favorite ? `${entry.name} aus Favoriten entfernen` : `${entry.name} zu Favoriten hinzufügen`"
      @click="emit('toggle-favorite', entry.id)"
    >
      <AppIcon name="star" :filled="entry.favorite" :size="20" />
    </button>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding-right: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  transition:
    border-color var(--transition),
    background var(--transition);
}

.row:hover {
  border-color: var(--border-strong);
  background: var(--surface-hover);
}

.row__main {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  text-align: left;
}

.row__avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: var(--radius-sm);
  font-weight: 700;
}

.row__avatar--0 {
  background: var(--accent-soft);
  color: var(--accent);
}
.row__avatar--1 {
  background: var(--info-soft);
  color: var(--info);
}
.row__avatar--2 {
  background: var(--warning-soft);
  color: var(--warning);
}
.row__avatar--3 {
  background: var(--success-soft);
  color: var(--success);
}
.row__avatar--4 {
  background: var(--danger-soft);
  color: var(--danger);
}

.row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row__name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-3);
  overflow: hidden;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.row__meta > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.row__host {
  color: var(--text-faint);
}

.row__fav--on {
  color: var(--warning);
}

@media (max-width: 640px) {
  .row__vault {
    display: none;
  }
  .row__main {
    padding-inline: var(--space-3);
    gap: var(--space-3);
  }
}
</style>
