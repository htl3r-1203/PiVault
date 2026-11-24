<script setup lang="ts">
import { computed, ref } from 'vue'
import AlertBanner from '../common/AlertBanner.vue'
import AppIcon from '../common/AppIcon.vue'
import CopyButton from '../common/CopyButton.vue'
import PasswordField from '../common/PasswordField.vue'
import type { VaultEntry } from '@/types/vault'
import { formatDateTime } from '@/utils/format'
import { hostnameOf, safeHref } from '@/utils/url'

const props = defineProps<{ entry: VaultEntry; vaultName: string }>()
const emit = defineEmits<{ edit: []; delete: []; 'toggle-favorite': [] }>()

const copyError = ref('')
const href = computed(() => safeHref(props.entry.url))
</script>

<template>
  <div class="detail">
    <div class="detail__top">
      <span class="badge">{{ vaultName }}</span>
      <button
        type="button"
        class="btn btn--sm"
        :class="{ 'detail__fav--on': entry.favorite }"
        :aria-pressed="entry.favorite"
        @click="emit('toggle-favorite')"
      >
        <AppIcon name="star" :filled="entry.favorite" :size="16" />
        {{ entry.favorite ? 'Favorit' : 'Als Favorit markieren' }}
      </button>
    </div>

    <AlertBanner v-if="copyError" variant="error">{{ copyError }}</AlertBanner>

    <dl class="detail__fields">
      <div class="detail__field">
        <dt>Benutzername</dt>
        <dd class="detail__value">
          <span class="detail__text">{{ entry.username || '–' }}</span>
          <CopyButton v-if="entry.username" :value="entry.username" label="Benutzernamen kopieren" @error="copyError = $event" />
        </dd>
      </div>

      <div class="detail__field">
        <dt class="sr-only">Passwort</dt>
        <dd><PasswordField :model-value="entry.password" label="Passwort" readonly copyable @copy-error="copyError = $event" /></dd>
      </div>

      <div class="detail__field">
        <dt>Website</dt>
        <dd class="detail__value">
          <a v-if="href" :href="href" target="_blank" rel="noopener noreferrer" class="detail__link">
            {{ hostnameOf(entry.url) }}
            <AppIcon name="external" :size="14" />
            <span class="sr-only">(öffnet in neuem Tab)</span>
          </a>
          <span v-else class="detail__text">{{ entry.url || '–' }}</span>
        </dd>
      </div>

      <div class="detail__field">
        <dt>Notizen</dt>
        <dd class="detail__notes">{{ entry.notes || '–' }}</dd>
      </div>

      <div class="detail__field">
        <dt>Zuletzt geändert</dt>
        <dd class="detail__text">{{ formatDateTime(entry.updatedAt) }}</dd>
      </div>
    </dl>

    <div class="detail__actions">
      <button type="button" class="btn" @click="emit('edit')"><AppIcon name="edit" :size="16" />Bearbeiten</button>
      <button type="button" class="btn btn--danger-ghost" @click="emit('delete')">
        <AppIcon name="trash" :size="16" />Löschen
      </button>
    </div>
  </div>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.detail__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.detail__fav--on {
  color: var(--warning);
  border-color: color-mix(in srgb, var(--warning) 50%, transparent);
}

.detail__fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: 0;
}

.detail__field dt {
  margin-bottom: var(--space-1);
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 600;
}

.detail__field dd {
  margin: 0;
}

.detail__value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 2.25rem;
}

.detail__text,
.detail__link {
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail__link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.detail__notes {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}
</style>
