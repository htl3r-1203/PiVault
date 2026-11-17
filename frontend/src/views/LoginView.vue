<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/services/api'
import { login } from '@/services/auth'
import '@/assets/auth-form.css'

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
  <main class="auth">
    <h1>Anmelden</h1>
    <p v-if="registered" class="form-success" role="status">
      Registrierung erfolgreich. Bitte jetzt anmelden.
    </p>
    <form novalidate @submit.prevent="submit">
      <label>
        E-Mail-Adresse oder Benutzername
        <input v-model="identifier" type="text" name="identifier" autocomplete="username" required />
      </label>
      <label>
        Passwort
        <input v-model="password" type="password" name="password" autocomplete="current-password" required />
        <span class="hint">Das Login-Passwort, nicht das Master-Passwort.</span>
      </label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Bitte warten …' : 'Anmelden' }}</button>
    </form>
    <p class="switch">Noch kein Konto? <RouterLink :to="{ name: 'register' }">Registrieren</RouterLink></p>
  </main>
</template>
