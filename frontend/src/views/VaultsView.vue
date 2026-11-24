<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AlertBanner from '@/components/common/AlertBanner.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import DemoBanner from '@/components/vault/DemoBanner.vue'
import { useVault } from '@/composables/useVault'

const vault = useVault()
const { state } = vault

const cards = computed(() =>
  state.vaults.map((v) => ({ ...v, count: state.entries.filter((e) => e.vaultId === v.id).length })),
)
</script>

<template>
  <div class="page">
    <PageHeader title="Tresore" subtitle="Eine Sortierung deiner Einträge nach Themen." />
    <DemoBanner v-if="vault.isDemo" />

    <AlertBanner v-if="state.status === 'error'" variant="error" title="Laden fehlgeschlagen">
      {{ state.error }}
      <template #action>
        <button type="button" class="btn btn--sm" @click="vault.reload()">Erneut versuchen</button>
      </template>
    </AlertBanner>
    <p v-else-if="state.status !== 'ready'" class="muted" role="status">Tresore werden geladen …</p>

    <ul v-else class="grid" aria-label="Tresore">
      <li v-for="card in cards" :key="card.id">
        <RouterLink :to="{ name: 'home', query: { vault: card.id } }" class="card vcard">
          <span class="vcard__icon"><AppIcon name="vault" :size="22" /></span>
          <span class="vcard__text">
            <span class="vcard__name">{{ card.name }}</span>
            <span class="vcard__count">{{ card.count }} {{ card.count === 1 ? 'Eintrag' : 'Einträge' }}</span>
          </span>
          <AppIcon name="chevronRight" :size="18" />
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.muted {
  color: var(--text-muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: var(--space-4);
}

.vcard {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  color: var(--text);
  text-decoration: none;
  transition:
    border-color var(--transition),
    background var(--transition);
}

.vcard:hover {
  border-color: var(--border-strong);
  background: var(--surface-hover);
  color: var(--text);
}

.vcard__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
}

.vcard__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.vcard__name {
  font-weight: 600;
}

.vcard__count {
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
