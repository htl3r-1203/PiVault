<script setup lang="ts">
import { reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ApiError } from '@/services/api'
import { register } from '@/services/auth'
import AuthLayout from '@/components/layout/AuthLayout.vue'

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
  <AuthLayout title="Registrieren" subtitle="Erstelle dein PiVault-Konto.">
    <form class="auth-form" novalidate @submit.prevent="submit">
      <div class="field">
        <label class="field__label" for="reg-username">Benutzername</label>
        <input
          id="reg-username"
          v-model="form.username"
          class="input"
          type="text"
          name="username"
          autocomplete="username"
          :aria-invalid="!!errors.username" :aria-describedby="errors.username ? 'reg-username-err' : undefined"
          required
        />
        <span v-if="errors.username" id="reg-username-err" class="field__error">{{ errors.username }}</span>
      </div>
      <div class="field">
        <label class="field__label" for="reg-first_name">Vorname</label>
        <input
          id="reg-first_name"
          v-model="form.first_name"
          class="input"
          type="text"
          name="first_name"
          autocomplete="given-name"
          :aria-invalid="!!errors.first_name" :aria-describedby="errors.first_name ? 'reg-first_name-err' : undefined"
          required
        />
        <span v-if="errors.first_name" id="reg-first_name-err" class="field__error">{{ errors.first_name }}</span>
      </div>
      <div class="field">
        <label class="field__label" for="reg-last_name">Nachname</label>
        <input
          id="reg-last_name"
          v-model="form.last_name"
          class="input"
          type="text"
          name="last_name"
          autocomplete="family-name"
          :aria-invalid="!!errors.last_name" :aria-describedby="errors.last_name ? 'reg-last_name-err' : undefined"
          required
        />
        <span v-if="errors.last_name" id="reg-last_name-err" class="field__error">{{ errors.last_name }}</span>
      </div>
      <div class="field">
        <label class="field__label" for="reg-email">E-Mail-Adresse</label>
        <input
          id="reg-email"
          v-model="form.email"
          class="input"
          type="email"
          name="email"
          autocomplete="email"
          :aria-invalid="!!errors.email" :aria-describedby="errors.email ? 'reg-email-err' : undefined"
          required
        />
        <span v-if="errors.email" id="reg-email-err" class="field__error">{{ errors.email }}</span>
      </div>
      <div class="field">
        <label class="field__label" for="reg-password">Login-Passwort</label>
        <input
          id="reg-password"
          v-model="form.password"
          class="input"
          type="password"
          name="password"
          autocomplete="new-password"
          :aria-invalid="!!errors.password" :aria-describedby="errors.password ? 'reg-password-err' : 'reg-password-hint'"
          required
        />
        <span id="reg-password-hint" class="field__hint">
          Mindestens 12 Zeichen. Das Master-Passwort für den Tresor wird später separat festgelegt und nie an den Server gesendet.
        </span>
        <span v-if="errors.password" id="reg-password-err" class="field__error">{{ errors.password }}</span>
      </div>
      <div class="field">
        <label class="field__label" for="reg-passwordRepeat">Login-Passwort wiederholen</label>
        <input
          id="reg-passwordRepeat"
          v-model="form.passwordRepeat"
          class="input"
          type="password"
          name="passwordRepeat"
          autocomplete="new-password"
          :aria-invalid="!!errors.passwordRepeat" :aria-describedby="errors.passwordRepeat ? 'reg-passwordRepeat-err' : undefined"
          required
        />
        <span v-if="errors.passwordRepeat" id="reg-passwordRepeat-err" class="field__error">{{ errors.passwordRepeat }}</span>
      </div>
      <p v-if="formError" class="alert-box alert-box--error" role="alert">{{ formError }}</p>
      <button type="submit" class="btn btn--primary btn--block" :disabled="loading">
        {{ loading ? 'Bitte warten …' : 'Konto erstellen' }}
      </button>
    </form>
    <p class="auth-switch">Schon registriert? <RouterLink :to="{ name: 'login' }">Anmelden</RouterLink></p>
  </AuthLayout>
</template>
