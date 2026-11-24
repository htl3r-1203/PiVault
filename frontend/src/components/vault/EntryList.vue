<script setup lang="ts">
import EntryListItem from './EntryListItem.vue'
import type { VaultEntry } from '@/types/vault'

defineProps<{ entries: VaultEntry[]; vaultName: (id: string) => string }>()
const emit = defineEmits<{ open: [id: string]; 'toggle-favorite': [id: string] }>()
</script>

<template>
  <ul class="list" aria-label="Passworteinträge">
    <EntryListItem
      v-for="entry in entries"
      :key="entry.id"
      :entry="entry"
      :vault-name="vaultName(entry.vaultId)"
      @open="emit('open', $event)"
      @toggle-favorite="emit('toggle-favorite', $event)"
    />
  </ul>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
