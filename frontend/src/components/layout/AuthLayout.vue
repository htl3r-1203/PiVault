<script setup lang="ts">
import AppLogo from '../common/AppLogo.vue'

defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <main class="auth">
    <div class="auth__card">
      <div class="auth__brand"><AppLogo :size="36" /></div>
      <h1 class="auth__title">{{ title }}</h1>
      <p v-if="subtitle" class="auth__sub">{{ subtitle }}</p>
      <slot />
    </div>
    <p class="auth__footer">Selbst gehosteter Passwortmanager</p>
  </main>
</template>

<style scoped>
.auth {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  min-height: 100vh;
  padding: var(--space-5) var(--space-4);
  background:
    radial-gradient(60rem 30rem at 50% -10%, var(--accent-soft), transparent 70%),
    var(--bg);
}

.auth__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: min(28rem, 100%);
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.auth__brand {
  display: flex;
  justify-content: center;
}

.auth__title {
  text-align: center;
}

.auth__sub {
  margin-top: calc(var(--space-2) * -1);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.925rem;
}

.auth__footer {
  color: var(--text-faint);
  font-size: 0.8rem;
}

@media (max-width: 480px) {
  .auth__card {
    padding: var(--space-5) var(--space-4);
  }
}
</style>
