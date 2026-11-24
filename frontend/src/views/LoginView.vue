<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/services/api'
import { login } from '@/services/auth'
import AuthLayout from '@/components/layout/AuthLayout.vue'

const route = useRoute()
const router = useRouter()

const identifier = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const registered = route.query.registered === '1'

// Nur interne Pfade als Weiterleitungsziel zulassen (kein Open Redirect)
function redirectTarget(): string {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
}

async function submit() {
  error.value = ''
  if (!identifier.value.trim() || !password.value) {
    error.value = 'Bitte E-Mail-Adresse oder Benutzernamen und Passwort eingeben.'
    return
  }
  loading.value = true
  try {
    await login(identifier.value.trim(), password.value)
    await router.push(redirectTarget())
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : 'Der Server ist nicht erreichbar. Bitte später erneut versuchen.'
    password.value = ''
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthLayout title="Anmelden" subtitle="Willkommen zurück bei PiVault.">
    <p v-if="registered" class="alert-box alert-box--success" role="status">
      Registrierung erfolgreich. Bitte jetzt anmelden.
    </p>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <div class="field">
        <label class="field__label" for="login-identifier">E-Mail-Adresse oder Benutzername</label>
        <input
          id="login-identifier"
          v-model="identifier"
          class="input"
          type="text"
          name="identifier"
          autocomplete="username"
          required
        />
      </div>
      <div class="field">
        <label class="field__label" for="login-password">Passwort</label>
        <input
          id="login-password"
          v-model="password"
          class="input"
          type="password"
          name="password"
          autocomplete="current-password"
          aria-describedby="login-password-hint"
          required
        />
        <span id="login-password-hint" class="field__hint">Das Login-Passwort, nicht das Master-Passwort.</span>
      </div>
      <p v-if="error" class="alert-box alert-box--error" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn--primary btn--block" :disabled="loading">
        {{ loading ? 'Bitte warten …' : 'Anmelden' }}
      </button>
    </form>
    <p class="auth-switch">Noch kein Konto? <RouterLink :to="{ name: 'register' }">Registrieren</RouterLink></p>
  </AuthLayout>
</template>
