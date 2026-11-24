<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from '../common/AppIcon.vue'
import { authState } from '@/services/auth'
</script>

<template>
  <section class="l-section cta-wrap" aria-labelledby="cta-title">
    <div class="l-container">
      <div class="cta">
        <h2 id="cta-title" class="cta__title">Bereit, deine Passwortverwaltung selbst in die Hand zu nehmen?</h2>
        <p class="cta__text">
          Erstelle ein Konto und probiere die Oberfläche aus. Bitte beachte: Bis Masterpasswort und Verschlüsselung
          fertig sind, ist PiVault nur mit Demo-Daten zu verwenden.
        </p>
        <div class="cta__actions">
          <RouterLink v-if="authState.user" :to="{ name: 'dashboard' }" class="btn btn--primary btn--lg">
            Zum Dashboard<AppIcon name="arrowRight" :size="18" />
          </RouterLink>
          <template v-else>
            <RouterLink :to="{ name: 'register' }" class="btn btn--primary btn--lg">
              Konto erstellen<AppIcon name="arrowRight" :size="18" />
            </RouterLink>
            <RouterLink :to="{ name: 'login' }" class="btn btn--lg">Anmelden</RouterLink>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta {
  position: relative;
  overflow: hidden;
  padding: clamp(2rem, 6vw, 3.5rem) clamp(1.25rem, 5vw, 3.5rem);
  border: 1px solid var(--border-strong);
  border-radius: calc(var(--radius-lg) + 4px);
  background:
    radial-gradient(30rem 14rem at 15% 0%, var(--accent-soft), transparent 70%),
    radial-gradient(26rem 14rem at 100% 100%, var(--info-soft), transparent 70%),
    var(--surface);
  text-align: center;
}

.cta__title {
  max-width: 36rem;
  margin-inline: auto;
  font-size: clamp(1.5rem, 3.4vw, 2.2rem);
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.cta__text {
  max-width: 34rem;
  margin: var(--space-4) auto 0;
  color: var(--text-muted);
}

.cta__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-6);
}
</style>
