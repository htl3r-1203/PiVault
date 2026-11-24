<script setup lang="ts">
// Formular für neue und bestehende Einträge. Der Zustand entsteht beim Einbinden neu
// (EntryFormDialog rendert die Komponente nur bei geöffnetem Dialog).
import { reactive, useId } from 'vue'
import AlertBanner from '../common/AlertBanner.vue'
import PasswordField from '../common/PasswordField.vue'
import type { EntryDraft, Vault, VaultEntry } from '@/types/vault'
import { parseHttpUrl } from '@/utils/url'

const props = defineProps<{
  entry: VaultEntry | null
  vaults: Vault[]
  defaultVaultId: string
  saving: boolean
  error: string
}>()
const emit = defineEmits<{ save: [draft: EntryDraft]; cancel: [] }>()

const LIMITS = { name: 100, username: 255, password: 1024, url: 2048, notes: 5000 }

const formId = useId()
const form = reactive<EntryDraft>({
  vaultId: props.entry?.vaultId ?? props.defaultVaultId,
  name: props.entry?.name ?? '',
  username: props.entry?.username ?? '',
  password: props.entry?.password ?? '',
  url: props.entry?.url ?? '',
  notes: props.entry?.notes ?? '',
})
const errors = reactive<Partial<Record<keyof EntryDraft, string>>>({})

function validate(): boolean {
  for (const key of Object.keys(errors) as (keyof EntryDraft)[]) delete errors[key]
  const name = form.name.trim()
  if (!name) errors.name = 'Bitte einen Namen angeben.'
  else if (name.length > LIMITS.name) errors.name = `Höchstens ${LIMITS.name} Zeichen.`
  if (form.username.length > LIMITS.username) errors.username = `Höchstens ${LIMITS.username} Zeichen.`
  if (!form.password) errors.password = 'Bitte ein Passwort angeben.'
  else if (form.password.length > LIMITS.password) errors.password = `Höchstens ${LIMITS.password} Zeichen.`
  const url = form.url.trim()
  if (url && (url.length > LIMITS.url || !parseHttpUrl(url))) {
    errors.url = 'Bitte eine gültige Adresse mit http:// oder https:// angeben.'
  }
  if (form.notes.length > LIMITS.notes) errors.notes = `Höchstens ${LIMITS.notes} Zeichen.`
  if (!props.vaults.some((v) => v.id === form.vaultId)) errors.vaultId = 'Bitte einen Tresor wählen.'
  return Object.keys(errors).length === 0
}

function submit() {
  if (props.saving || !validate()) return
  emit('save', {
    vaultId: form.vaultId,
    name: form.name.trim(),
    username: form.username.trim(),
    password: form.password,
    url: form.url.trim(),
    notes: form.notes,
  })
}
</script>

<template>
  <form :id="formId" class="form" novalidate @submit.prevent="submit">
    <AlertBanner variant="warning">
      Demo: Es werden nichts gespeichert und nichts verschlüsselt. Bitte keine echten Zugangsdaten eingeben.
    </AlertBanner>
    <AlertBanner v-if="error" variant="error">{{ error }}</AlertBanner>

    <div class="field">
      <label class="field__label" :for="`${formId}-name`">Name des Dienstes</label>
      <input
        :id="`${formId}-name`"
        v-model="form.name"
        class="input"
        type="text"
        :maxlength="LIMITS.name"
        :aria-invalid="!!errors.name || undefined"
        :aria-describedby="errors.name ? `${formId}-name-err` : undefined"
        autocomplete="off"
        autofocus
      />
      <span v-if="errors.name" :id="`${formId}-name-err`" class="field__error">{{ errors.name }}</span>
    </div>

    <div class="field">
      <label class="field__label" :for="`${formId}-user`">Benutzername</label>
      <input
        :id="`${formId}-user`"
        v-model="form.username"
        class="input"
        type="text"
        :maxlength="LIMITS.username"
        :aria-invalid="!!errors.username || undefined"
        :aria-describedby="errors.username ? `${formId}-user-err` : undefined"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
      <span v-if="errors.username" :id="`${formId}-user-err`" class="field__error">{{ errors.username }}</span>
    </div>

    <div class="field">
      <PasswordField
        v-model="form.password"
        label="Passwort"
        :invalid="!!errors.password"
        :describedby="errors.password ? `${formId}-pw-err` : undefined"
        :maxlength="LIMITS.password"
      />
      <span v-if="errors.password" :id="`${formId}-pw-err`" class="field__error">{{ errors.password }}</span>
    </div>

    <div class="field">
      <label class="field__label" :for="`${formId}-url`">Website-URL</label>
      <input
        :id="`${formId}-url`"
        v-model="form.url"
        class="input"
        type="url"
        inputmode="url"
        placeholder="https://beispiel.example.com"
        :maxlength="LIMITS.url"
        :aria-invalid="!!errors.url || undefined"
        :aria-describedby="errors.url ? `${formId}-url-err` : undefined"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
      <span v-if="errors.url" :id="`${formId}-url-err`" class="field__error">{{ errors.url }}</span>
    </div>

    <div class="field">
      <label class="field__label" :for="`${formId}-vault`">Tresor</label>
      <select :id="`${formId}-vault`" v-model="form.vaultId" class="input" :aria-invalid="!!errors.vaultId || undefined">
        <option v-for="v in vaults" :key="v.id" :value="v.id">{{ v.name }}</option>
      </select>
      <span v-if="errors.vaultId" class="field__error">{{ errors.vaultId }}</span>
    </div>

    <div class="field">
      <label class="field__label" :for="`${formId}-notes`">Notizen</label>
      <textarea
        :id="`${formId}-notes`"
        v-model="form.notes"
        class="input"
        rows="4"
        :maxlength="LIMITS.notes"
        :aria-invalid="!!errors.notes || undefined"
      />
      <span v-if="errors.notes" class="field__error">{{ errors.notes }}</span>
    </div>

    <div class="form__actions">
      <button type="button" class="btn" :disabled="saving" @click="emit('cancel')">Abbrechen</button>
      <button type="submit" class="btn btn--primary" :disabled="saving">
        {{ saving ? 'Bitte warten …' : entry ? 'Änderungen übernehmen' : 'Eintrag hinzufügen' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form__actions {
  position: sticky;
  bottom: calc(var(--space-5) * -1);
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-3);
  margin: 0 calc(var(--space-5) * -1) calc(var(--space-5) * -1);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
}
</style>
