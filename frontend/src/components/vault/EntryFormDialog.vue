<script setup lang="ts">
import BaseDialog from '../common/BaseDialog.vue'
import EntryForm from './EntryForm.vue'
import type { EntryDraft, Vault, VaultEntry } from '@/types/vault'

defineProps<{
  open: boolean
  entry: VaultEntry | null
  vaults: Vault[]
  defaultVaultId: string
  saving: boolean
  error: string
}>()
const emit = defineEmits<{ save: [draft: EntryDraft]; close: [] }>()
</script>

<template>
  <BaseDialog :open="open" :title="entry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'" @close="emit('close')">
    <EntryForm
      :entry="entry"
      :vaults="vaults"
      :default-vault-id="defaultVaultId"
      :saving="saving"
      :error="error"
      @save="emit('save', $event)"
      @cancel="emit('close')"
    />
  </BaseDialog>
</template>
