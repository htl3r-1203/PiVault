<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getHealth } from '@/services/api'

const backendStatus = ref<'wird geprüft …' | 'erreichbar' | 'nicht erreichbar'>('wird geprüft …')

onMounted(async () => {
  try {
    const health = await getHealth()
    backendStatus.value = health.status === 'ok' ? 'erreichbar' : 'nicht erreichbar'
  } catch {
    backendStatus.value = 'nicht erreichbar'
  }
})
</script>

<template>
  <main class="home">
    <h1>PiVault</h1>
    <p>Backend: {{ backendStatus }}</p>
  </main>
</template>

<style scoped>
.home {
  font-family: system-ui, sans-serif;
  text-align: center;
  margin-top: 4rem;
}
</style>
