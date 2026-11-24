<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from '../common/AppIcon.vue'
import DashboardPreview from './DashboardPreview.vue'
import { authState } from '@/services/auth'
</script>

<template>
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero__glow" aria-hidden="true" />
    <div class="l-container hero__grid">
      <div class="hero__text">
        <p class="hero__status">
          <span class="badge badge--warning">In Entwicklung</span>
          <span class="hero__status-text">Selbst gehosteter Passwortmanager</span>
        </p>
        <h1 id="hero-title" class="hero__title">
          Deine Passwörter. <span class="hero__accent">Deine Kontrolle.</span>
        </h1>
        <p class="hero__lead">
          PiVault ist dein selbst gehosteter Passwortmanager – entwickelt für eine übersichtliche und sichere
          Verwaltung deiner Zugangsdaten.
        </p>
        <div class="hero__actions">
          <RouterLink v-if="authState.user" :to="{ name: 'dashboard' }" class="btn btn--primary btn--lg">
            Zum Dashboard<AppIcon name="arrowRight" :size="18" />
          </RouterLink>
          <template v-else>
            <RouterLink :to="{ name: 'register' }" class="btn btn--primary btn--lg">
              Jetzt registrieren<AppIcon name="arrowRight" :size="18" />
            </RouterLink>
            <RouterLink :to="{ name: 'login' }" class="btn btn--lg">Anmelden</RouterLink>
          </template>
        </div>
        <ul class="hero__facts">
          <li><AppIcon name="server" :size="16" />Läuft auf deinem Raspberry Pi 5</li>
          <li><AppIcon name="shield" :size="16" />Geschützte Anmeldung</li>
          <li><AppIcon name="code" :size="16" />Schulprojekt der HTL</li>
        </ul>
      </div>
      <div class="hero__visual">
        <DashboardPreview />
        <p class="hero__caption">Vorschau der Oberfläche mit erfundenen Beispieldaten.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  padding-block: clamp(2.5rem, 7vw, 5.5rem) clamp(3rem, 8vw, 6rem);
}

.hero__glow {
  position: absolute;
  inset: -10rem 0 auto 0;
  height: 40rem;
  background:
    radial-gradient(40rem 22rem at 18% 30%, var(--accent-soft), transparent 70%),
    radial-gradient(34rem 20rem at 85% 10%, var(--info-soft), transparent 70%);
  pointer-events: none;
}

.hero__grid {
  position: relative;
  display: grid;
  gap: clamp(2.5rem, 6vw, 4rem);
  align-items: center;
}

.hero__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  color: var(--text-muted);
  font-size: 0.9rem;
}

.hero__title {
  font-size: clamp(2.25rem, 6vw, 3.9rem);
  line-height: 1.05;
  letter-spacing: -0.03em;
}

.hero__accent {
  background: linear-gradient(100deg, var(--accent), var(--info));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero__lead {
  max-width: 34rem;
  margin-top: var(--space-5);
  color: var(--text-muted);
  font-size: clamp(1.02rem, 1.8vw, 1.2rem);
  line-height: 1.6;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-6);
}

.hero__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
  margin-top: var(--space-6);
  color: var(--text-muted);
  font-size: 0.875rem;
}

.hero__facts li {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.hero__facts :deep(svg) {
  color: var(--accent);
}

.hero__visual {
  min-width: 0;
}

.hero__caption {
  margin-top: var(--space-3);
  color: var(--text-faint);
  font-size: 0.78rem;
  text-align: center;
}

/* Sanfter Einstieg beim Laden; wird bei prefers-reduced-motion global abgeschaltet (base.css) */
.hero__text > *,
.hero__visual {
  animation: hero-in 600ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
.hero__text > :nth-child(2) {
  animation-delay: 70ms;
}
.hero__text > :nth-child(3) {
  animation-delay: 140ms;
}
.hero__text > :nth-child(4) {
  animation-delay: 210ms;
}
.hero__text > :nth-child(5) {
  animation-delay: 280ms;
}
.hero__visual {
  animation-delay: 200ms;
}

@keyframes hero-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}

@media (min-width: 980px) {
  .hero__grid {
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  }
}
</style>
