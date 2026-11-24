<script setup lang="ts">
// Dashboard: Übersicht aller Einträge (Demo) mit Suche, Filtern, Detail, Formular und Löschdialog.
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AlertBanner from '@/components/common/AlertBanner.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import DemoBanner from '@/components/vault/DemoBanner.vue'
import EntryDetail from '@/components/vault/EntryDetail.vue'
import EntryFormDialog from '@/components/vault/EntryFormDialog.vue'
import EntryList from '@/components/vault/EntryList.vue'
import EntryListSkeleton from '@/components/vault/EntryListSkeleton.vue'
import EntryToolbar, { type SortMode } from '@/components/vault/EntryToolbar.vue'
import { useVault } from '@/composables/useVault'
import { authState } from '@/services/auth'
import type { EntryDraft } from '@/types/vault'
import { greeting } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const vault = useVault()
const { state } = vault

const favoritesOnly = computed(() => route.meta.scope === 'favorites')

// Filter
const search = ref('')
const sort = ref<SortMode>('name')
const onlyFavorites = ref(false)
const vaultId = computed({
  get: () => (typeof route.query.vault === 'string' ? route.query.vault : ''),
  set: (value: string) => {
    void router.replace({ query: value ? { ...route.query, vault: value } : {} })
  },
})

const visibleEntries = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return state.entries
    .filter((e) => {
      if ((favoritesOnly.value || onlyFavorites.value) && !e.favorite) return false
      if (vaultId.value && e.vaultId !== vaultId.value) return false
      if (!needle) return true
      return [e.name, e.username, e.url, vault.vaultName(e.vaultId)].some((v) => v.toLowerCase().includes(needle))
    })
    .sort((a, b) =>
      sort.value === 'name'
        ? a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })
        : b.updatedAt.localeCompare(a.updatedAt),
    )
})

const filtersActive = computed(() => !!search.value.trim() || !!vaultId.value || onlyFavorites.value)

// Auswahl, Formular, Löschen
const selectedId = ref<string | null>(null)
const selected = computed(() => state.entries.find((e) => e.id === selectedId.value) ?? null)
const formOpen = ref(false)
const formEntryId = ref<string | null>(null)
const formEntry = computed(() => state.entries.find((e) => e.id === formEntryId.value) ?? null)
const saving = ref(false)
const formError = ref('')
const deleteOpen = ref(false)
const deleting = ref(false)
const deleteError = ref('')
const actionError = ref('')

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

function openNew() {
  formEntryId.value = null
  formError.value = ''
  formOpen.value = true
}

function openEdit() {
  if (!selected.value) return
  formEntryId.value = selected.value.id
  formError.value = ''
  formOpen.value = true
}

async function saveEntry(draft: EntryDraft) {
  saving.value = true
  formError.value = ''
  try {
    if (formEntryId.value) {
      await vault.updateEntry(formEntryId.value, draft)
    } else {
      const created = await vault.createEntry(draft)
      selectedId.value = created.id
    }
    formOpen.value = false
  } catch (e) {
    formError.value = message(e, 'Der Eintrag konnte nicht gespeichert werden.')
  } finally {
    saving.value = false
  }
}

async function toggleFavorite(id: string) {
  const entry = state.entries.find((e) => e.id === id)
  if (!entry) return
  actionError.value = ''
  try {
    await vault.setFavorite(id, !entry.favorite)
  } catch (e) {
    actionError.value = message(e, 'Der Favoritenstatus konnte nicht geändert werden.')
  }
}

function askDelete() {
  deleteError.value = ''
  deleteOpen.value = true
}

async function confirmDelete() {
  if (!selectedId.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await vault.deleteEntry(selectedId.value)
    deleteOpen.value = false
    selectedId.value = null
  } catch (e) {
    deleteError.value = message(e, 'Der Eintrag konnte nicht gelöscht werden.')
  } finally {
    deleting.value = false
  }
}

function resetFilters() {
  search.value = ''
  onlyFavorites.value = false
  vaultId.value = ''
}

const title = computed(() => {
  if (favoritesOnly.value) return 'Favoriten'
  const first = authState.user?.first_name
  return first ? `${greeting()}, ${first}` : greeting()
})

const subtitle = computed(() => {
  if (state.status !== 'ready') return ''
  const n = visibleEntries.value.length
  const noun = n === 1 ? 'Eintrag' : 'Einträge'
  return favoritesOnly.value ? `${n} favorisierte ${noun}` : `${n} ${noun} im Demo-Tresor`
})
</script>

<template>
  <div class="home">
    <PageHeader :title="title" :subtitle="subtitle">
      <template #actions>
        <button type="button" class="btn btn--primary" :disabled="state.status !== 'ready'" @click="openNew">
          <AppIcon name="plus" :size="18" />Eintrag hinzufügen
        </button>
      </template>
    </PageHeader>

    <DemoBanner v-if="vault.isDemo" />
    <AlertBanner v-if="actionError" variant="error">{{ actionError }}</AlertBanner>

    <template v-if="state.status === 'error'">
      <AlertBanner variant="error" title="Laden fehlgeschlagen">
        {{ state.error }}
        <template #action>
          <button type="button" class="btn btn--sm" @click="vault.reload()">Erneut versuchen</button>
        </template>
      </AlertBanner>
    </template>

    <template v-else-if="state.status !== 'ready'">
      <p class="sr-only" role="status">Einträge werden geladen …</p>
      <EntryListSkeleton aria-busy="true" />
    </template>

    <template v-else>
      <EntryToolbar
        v-model:search="search"
        v-model:vault-id="vaultId"
        v-model:sort="sort"
        v-model:only-favorites="onlyFavorites"
        :vaults="state.vaults"
        :show-favorites-toggle="!favoritesOnly"
      />

      <EntryList
        v-if="visibleEntries.length"
        :entries="visibleEntries"
        :vault-name="vault.vaultName"
        @open="selectedId = $event"
        @toggle-favorite="toggleFavorite"
      />

      <EmptyState v-else-if="filtersActive" icon="search" title="Keine Treffer">
        Zu den aktuellen Suchbegriffen und Filtern gibt es keine Einträge.
        <template #action>
          <button type="button" class="btn" @click="resetFilters">Filter zurücksetzen</button>
        </template>
      </EmptyState>

      <EmptyState v-else-if="favoritesOnly" icon="star" title="Noch keine Favoriten">
        Markiere Einträge mit dem Stern, damit sie hier erscheinen.
      </EmptyState>

      <EmptyState v-else icon="vault" title="Noch keine Einträge">
        Lege deinen ersten Eintrag an. Im Demo-Modus gehen alle Eingaben beim Neuladen verloren.
        <template #action>
          <button type="button" class="btn btn--primary" @click="openNew">
            <AppIcon name="plus" :size="18" />Eintrag hinzufügen
          </button>
        </template>
      </EmptyState>
    </template>

    <BaseDialog :open="!!selected" :title="selected?.name ?? ''" variant="side" @close="selectedId = null">
      <EntryDetail
        v-if="selected"
        :entry="selected"
        :vault-name="vault.vaultName(selected.vaultId)"
        @edit="openEdit"
        @delete="askDelete"
        @toggle-favorite="toggleFavorite(selected.id)"
      />
    </BaseDialog>

    <EntryFormDialog
      :open="formOpen"
      :entry="formEntry"
      :vaults="state.vaults"
      :default-vault-id="vaultId || state.vaults[0]?.id || ''"
      :saving="saving"
      :error="formError"
      @save="saveEntry"
      @close="formOpen = false"
    />

    <ConfirmDialog
      :open="deleteOpen"
      title="Eintrag löschen?"
      confirm-label="Endgültig löschen"
      danger
      :busy="deleting"
      :error="deleteError"
      @confirm="confirmDelete"
      @cancel="deleteOpen = false"
    >
      „{{ selected?.name }}“ wird aus dem Demo-Tresor entfernt. Das kann nicht rückgängig gemacht werden.
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
</style>
