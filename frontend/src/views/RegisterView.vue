<script setup lang="ts">
import { reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ApiError } from '@/services/api'
import { register } from '@/services/auth'
import '@/assets/auth-form.css'

const router = useRouter()

const form = reactive({
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  passwordRepeat: '',
})
const errors = reactive<Record<string, string>>({})
const formError = ref('')
const loading = ref(false)

// Dieselben Regeln wie im Backend (dort werden sie verbindlich geprüft)
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,49}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(): boolean {
  for (const key of Object.keys(errors)) delete errors[key]
  if (!USERNAME_RE.test(form.username.trim())) {
    errors.username =
      'Der Benutzername muss 3 bis 50 Zeichen lang sein, mit Buchstabe oder Ziffer beginnen und darf nur Buchstaben, Ziffern, Punkt, Unterstrich und Bindestrich enthalten.'
  }
  if (!form.first_name.trim() || form.first_name.trim().length > 100) {
    errors.first_name = 'Bitte einen Vornamen mit höchstens 100 Zeichen angeben.'
  }
  if (!form.last_name.trim() || form.last_name.trim().length > 100) {
    errors.last_name = 'Bitte einen Nachnamen mit höchstens 100 Zeichen angeben.'
  }
  if (!EMAIL_RE.test(form.email.trim()) || form.email.trim().length > 254) {
    errors.email = 'Bitte eine gültige E-Mail-Adresse angeben.'
  }
  if (form.password.length < 12 || form.password.length > 128) {
    errors.password = 'Das Passwort muss zwischen 12 und 128 Zeichen lang sein.'
  }
  if (form.password !== form.passwordRepeat) {
    errors.passwordRepeat = 'Die Passwörter stimmen nicht überein.'
  }
  return Object.keys(errors).length === 0
}

async function submit() {
  formError.value = ''
  if (!validate()) return
  loading.value = true
  try {
    await register({
      username: form.username.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      password: form.password,
    })
    await router.push({ name: 'login', query: { registered: '1' } })
  } catch (e) {
    if (e instanceof ApiError) {
      Object.assign(errors, e.fieldErrors)
      if (Object.keys(e.fieldErrors).length === 0) formError.value = e.message
    } else {
      formError.value = 'Der Server ist nicht erreichbar. Bitte später erneut versuchen.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth">
    <h1>Registrieren</h1>
    <form novalidate @submit.prevent="submit">
      <label>
        Benutzername
        <input v-model="form.username" type="text" name="username" autocomplete="username" :aria-invalid="!!errors.username" required />
        <span v-if="errors.username" class="field-error">{{ errors.username }}</span>
      </label>
      <label>
        Vorname
        <input v-model="form.first_name" type="text" name="first_name" autocomplete="given-name" :aria-invalid="!!errors.first_name" required />
        <span v-if="errors.first_name" class="field-error">{{ errors.first_name }}</span>
      </label>
      <label>
        Nachname
        <input v-model="form.last_name" type="text" name="last_name" autocomplete="family-name" :aria-invalid="!!errors.last_name" required />
        <span v-if="errors.last_name" class="field-error">{{ errors.last_name }}</span>
      </label>
      <label>
        E-Mail-Adresse
        <input v-model="form.email" type="email" name="email" autocomplete="email" :aria-invalid="!!errors.email" required />
        <span v-if="errors.email" class="field-error">{{ errors.email }}</span>
      </label>
      <label>
        Login-Passwort
        <input v-model="form.password" type="password" name="password" autocomplete="new-password" :aria-invalid="!!errors.password" required />
        <span class="hint">
          Mindestens 12 Zeichen. Das Master-Passwort für den Tresor wird später separat festgelegt und nie an den Server gesendet.
        </span>
        <span v-if="errors.password" class="field-error">{{ errors.password }}</span>
      </label>
      <label>
        Login-Passwort wiederholen
        <input v-model="form.passwordRepeat" type="password" name="passwordRepeat" autocomplete="new-password" :aria-invalid="!!errors.passwordRepeat" required />
        <span v-if="errors.passwordRepeat" class="field-error">{{ errors.passwordRepeat }}</span>
      </label>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Bitte warten …' : 'Konto erstellen' }}</button>
    </form>
    <p class="switch">Schon registriert? <RouterLink :to="{ name: 'login' }">Anmelden</RouterLink></p>
  </main>
</template>
