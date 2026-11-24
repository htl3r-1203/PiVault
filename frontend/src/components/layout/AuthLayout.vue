<script setup lang="ts">
// Rahmen für Anmeldung und Registrierung: ein Dialog über der Startseite. Die Landingpage bleibt dahinter
// sichtbar. Zurück zur Startseite geht es über das X (und per Tastatur mit Esc); ein Klick auf den
// abgedunkelten Hintergrund schließt den Dialog bewusst nicht.
import { useRouter } from 'vue-router'
import BaseDialog from '../common/BaseDialog.vue'

defineProps<{ title: string; subtitle?: string; wide?: boolean }>()

const router = useRouter()

function close() {
  void router.push({ name: 'landing' })
}
</script>

<template>
  <BaseDialog
    :open="true"
    :title="title"
    close-label="Schließen und zurück zur Startseite"
    :close-on-backdrop="false"
    :wide="wide"
    @close="close"
  >
    <p v-if="subtitle" class="auth__sub">{{ subtitle }}</p>
    <div class="auth__content"><slot /></div>
  </BaseDialog>
</template>

<style scoped>
.auth__sub {
  margin-bottom: var(--space-4);
  color: var(--text-muted);
  font-size: 0.925rem;
}

.auth__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
