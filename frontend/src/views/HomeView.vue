<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getHealth } from '@/services/api'
import { authState, logout } from '@/services/auth'

const router = useRouter()
const backendStatus = ref<'wird geprüft …' | 'erreichbar' | 'nicht erreichbar'>('wird geprüft …')

onMounted(async () => {
  try {
    const health = await getHealth()
    backendStatus.value = health.status === 'ok' ? 'erreichbar' : 'nicht erreichbar'
  } catch {
    backendStatus.value = 'nicht erreichbar'
  }
})

async function signOut() {
  try {
    await logout()
  } finally {
    await router.push({ name: 'login' })
  }
}
</script>

<template>
  <main class="home">
    <h1>PiVault</h1>
    <p>Backend: {{ backendStatus }}</p>
    <p v-if="authState.user">
      Angemeldet als {{ authState.user.first_name }} {{ authState.user.last_name }} ({{
        authState.user.username
      }})
    </p>
    <button type="button" @click="signOut">Abmelden</button>
  </main>
</template>

<style scoped>
.home {
  font-family: system-ui, sans-serif;
  text-align: center;
  margin-top: 4rem;
}
</style>
