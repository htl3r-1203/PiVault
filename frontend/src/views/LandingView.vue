<script setup lang="ts">
// Öffentliche Startseite. Enthält keine Anmelde- oder Tresorlogik; angemeldete Benutzer sehen
// nur zusätzlich Links zum Dashboard.
import { RouterView } from 'vue-router'
import LandingAbout from '@/components/landing/LandingAbout.vue'
import LandingCta from '@/components/landing/LandingCta.vue'
import LandingFeatures from '@/components/landing/LandingFeatures.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
import LandingHeader from '@/components/landing/LandingHeader.vue'
import LandingHero from '@/components/landing/LandingHero.vue'
import LandingSecurity from '@/components/landing/LandingSecurity.vue'
import '@/assets/styles/landing.css'
</script>

<template>
  <div class="landing">
    <a class="skip-link" href="#inhalt">Zum Inhalt springen</a>
    <LandingHeader />
    <main id="inhalt" tabindex="-1">
      <LandingHero />
      <LandingFeatures />
      <LandingSecurity />
      <LandingAbout />
      <LandingCta />
    </main>
    <LandingFooter />
    <!-- Anmelde-/Registrierungsdialog (Kind-Routen /login und /register) -->
    <RouterView />
  </div>
</template>

<style scoped>
.landing {
  min-height: 100vh;
  background: var(--bg);
}

main:focus {
  outline: none;
}

.skip-link {
  position: absolute;
  left: var(--space-3);
  top: -4rem;
  z-index: 100;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
  text-decoration: none;
}

.skip-link:focus {
  top: var(--space-3);
}
</style>
