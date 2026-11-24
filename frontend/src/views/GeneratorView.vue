<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AlertBanner from '@/components/common/AlertBanner.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import CopyButton from '@/components/common/CopyButton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StrengthMeter from '@/components/common/StrengthMeter.vue'
import { isClipboardAvailable } from '@/services/clipboard'
import {
  GENERATOR_LIMITS,
  estimateEntropyBits,
  generatePassword,
  type GeneratorOptions,
} from '@/services/passwordGenerator'

const options = reactive<GeneratorOptions>({
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
})

const password = ref('')
const error = ref('')
const copyError = ref('')
const clipboardAvailable = isClipboardAvailable()

const anyClass = computed(() => options.lowercase || options.uppercase || options.digits || options.symbols)
const bits = computed(() => (password.value ? estimateEntropyBits(options) : 0))

function regenerate() {
  error.value = ''
  copyError.value = ''
  try {
    password.value = generatePassword(options)
  } catch (e) {
    password.value = ''
    error.value = e instanceof Error ? e.message : 'Das Passwort konnte nicht erzeugt werden.'
  }
}

function setLength(raw: number | string) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return
  options.length = Math.min(GENERATOR_LIMITS.max, Math.max(GENERATOR_LIMITS.min, n))
}

onMounted(regenerate)
watch(options, regenerate)
</script>

<template>
  <div class="page">
    <PageHeader
      title="Passwortgenerator"
      subtitle="Zufällige Passwörter, direkt im Browser erzeugt. Nichts wird gespeichert oder gesendet."
    />

    <AlertBanner v-if="!clipboardAvailable" variant="info" title="Kopieren eingeschränkt">
      Die Zwischenablage ist nur über HTTPS oder localhost verfügbar. Bei dieser Verbindung bitte das Passwort
      manuell markieren und kopieren.
    </AlertBanner>

    <section class="card result" aria-labelledby="gen-result">
      <h2 id="gen-result" class="sr-only">Erzeugtes Passwort</h2>
      <AlertBanner v-if="error" variant="error">{{ error }}</AlertBanner>
      <AlertBanner v-if="copyError" variant="error">{{ copyError }}</AlertBanner>
      <div class="result__row">
        <output class="result__value" aria-live="off" for="gen-length">{{ password || '–' }}</output>
        <CopyButton :value="password" label="Passwort kopieren" :disabled="!password" @error="copyError = $event" />
        <button type="button" class="btn btn--icon" aria-label="Neues Passwort erzeugen" title="Neu erzeugen" :disabled="!anyClass" @click="regenerate">
          <AppIcon name="refresh" :size="18" />
        </button>
      </div>
      <StrengthMeter v-if="password" :bits="bits" />
    </section>

    <form class="card settings" aria-labelledby="gen-settings" @submit.prevent="regenerate">
      <h2 id="gen-settings">Einstellungen</h2>

      <div class="field">
        <label class="field__label" for="gen-length">Länge: {{ options.length }} Zeichen</label>
        <div class="length">
          <input
            id="gen-length"
            class="length__range"
            type="range"
            :min="GENERATOR_LIMITS.min"
            :max="GENERATOR_LIMITS.max"
            :value="options.length"
            @input="setLength(($event.target as HTMLInputElement).value)"
          />
          <input
            class="input length__number"
            type="number"
            inputmode="numeric"
            aria-label="Länge als Zahl"
            :min="GENERATOR_LIMITS.min"
            :max="GENERATOR_LIMITS.max"
            :value="options.length"
            @change="setLength(($event.target as HTMLInputElement).value)"
          />
        </div>
        <span class="field__hint">Zwischen {{ GENERATOR_LIMITS.min }} und {{ GENERATOR_LIMITS.max }} Zeichen.</span>
      </div>

      <fieldset class="classes">
        <legend class="field__label">Zeichenarten</legend>
        <label class="check"><input v-model="options.uppercase" type="checkbox" />Großbuchstaben (A–Z)</label>
        <label class="check"><input v-model="options.lowercase" type="checkbox" />Kleinbuchstaben (a–z)</label>
        <label class="check"><input v-model="options.digits" type="checkbox" />Zahlen (0–9)</label>
        <label class="check"><input v-model="options.symbols" type="checkbox" />Sonderzeichen (!@#$%…)</label>
        <span v-if="!anyClass" class="field__error" role="alert">Bitte mindestens eine Zeichenart auswählen.</span>
      </fieldset>

      <div>
        <button type="submit" class="btn btn--primary" :disabled="!anyClass">
          <AppIcon name="refresh" :size="18" />Neu erzeugen
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 44rem;
}

.result,
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.result__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.result__value {
  flex: 1;
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  font-family: var(--font-mono);
  font-size: 1.15rem;
  letter-spacing: 0.04em;
  overflow-wrap: anywhere;
  user-select: all;
}

.length {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.length__range {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}

.length__number {
  width: 5.5rem;
  flex: none;
}

.classes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0 var(--space-4);
  margin: 0;
  padding: 0;
  border: 0;
}

.classes legend {
  margin-bottom: var(--space-2);
  padding: 0;
}

.classes .field__error {
  grid-column: 1 / -1;
}
</style>
