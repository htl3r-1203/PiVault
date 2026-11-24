<script setup lang="ts">
// Passwortfeld mit Anzeigen/Verbergen. Optional schreibgeschützt mit Kopierfunktion (Detailansicht).
import { ref, useId } from 'vue'
import AppIcon from './AppIcon.vue'
import CopyButton from './CopyButton.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    readonly?: boolean
    copyable?: boolean
    invalid?: boolean
    describedby?: string
    maxlength?: number
  }>(),
  { readonly: false, copyable: false, invalid: false, describedby: undefined, maxlength: undefined },
)
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'copy-error': [message: string] }>()

const id = useId()
const visible = ref(false)
</script>

<template>
  <div class="field">
    <label class="field__label" :for="id">{{ label }}</label>
    <div class="pwfield">
      <input
        :id="id"
        class="input pwfield__input"
        :type="visible ? 'text' : 'password'"
        :value="modelValue"
        :readonly="readonly"
        :maxlength="maxlength"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedby"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="btn btn--ghost btn--icon btn--sm"
        :aria-label="visible ? 'Passwort verbergen' : 'Passwort anzeigen'"
        :aria-pressed="visible"
        @click="visible = !visible"
      >
        <AppIcon :name="visible ? 'eyeOff' : 'eye'" :size="18" />
      </button>
      <CopyButton v-if="copyable" :value="props.modelValue" label="Passwort kopieren" @error="emit('copy-error', $event)" />
    </div>
  </div>
</template>

<style scoped>
.pwfield {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.pwfield__input {
  flex: 1;
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
}
</style>
