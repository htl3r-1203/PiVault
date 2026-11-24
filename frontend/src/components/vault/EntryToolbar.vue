<script setup lang="ts">
import { useId } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import type { Vault } from '@/types/vault'

export type SortMode = 'name' | 'updated'

defineProps<{ vaults: Vault[]; showFavoritesToggle: boolean }>()
const search = defineModel<string>('search', { required: true })
const vaultId = defineModel<string>('vaultId', { required: true })
const sort = defineModel<SortMode>('sort', { required: true })
const onlyFavorites = defineModel<boolean>('onlyFavorites', { required: true })

const searchId = useId()
const vaultSelectId = useId()
const sortId = useId()
</script>

<template>
  <div class="toolbar" role="search">
    <div class="toolbar__search">
      <label :for="searchId" class="sr-only">Einträge durchsuchen</label>
      <AppIcon name="search" :size="18" />
      <input
        :id="searchId"
        v-model="search"
        class="input toolbar__input"
        type="search"
        placeholder="Nach Name, Benutzername oder Website suchen"
        autocomplete="off"
        spellcheck="false"
        maxlength="200"
      />
    </div>
    <div class="toolbar__filters">
      <div class="toolbar__filter">
        <label :for="vaultSelectId" class="toolbar__label">Tresor</label>
        <select :id="vaultSelectId" v-model="vaultId" class="input">
          <option value="">Alle Tresore</option>
          <option v-for="v in vaults" :key="v.id" :value="v.id">{{ v.name }}</option>
        </select>
      </div>
      <div class="toolbar__filter">
        <label :for="sortId" class="toolbar__label">Sortierung</label>
        <select :id="sortId" v-model="sort" class="input">
          <option value="name">Name (A–Z)</option>
          <option value="updated">Zuletzt geändert</option>
        </select>
      </div>
      <label v-if="showFavoritesToggle" class="check toolbar__check">
        <input v-model="onlyFavorites" type="checkbox" />
        Nur Favoriten
      </label>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.toolbar__search {
  position: relative;
  display: flex;
  align-items: center;
  color: var(--text-faint);
}

.toolbar__search :deep(svg) {
  position: absolute;
  left: var(--space-3);
  pointer-events: none;
}

.toolbar__input {
  min-height: 2.9rem;
  padding-left: 2.5rem;
}

.toolbar__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-4);
}

.toolbar__filter {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 11rem;
}

.toolbar__label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}

.toolbar__check {
  min-height: 2.6rem;
}

@media (max-width: 560px) {
  .toolbar__filter {
    flex: 1 1 100%;
  }
}
</style>
