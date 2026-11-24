<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from '../common/AppIcon.vue'
import AppLogo from '../common/AppLogo.vue'
import LandingNavLink from './LandingNavLink.vue'
import { GITHUB_URL, LANDING_NAV } from './landingNav'
import { authState } from '@/services/auth'

const year = new Date().getFullYear()
</script>

<template>
  <footer class="footer">
    <div class="l-container footer__grid">
      <div class="footer__about">
        <RouterLink :to="{ name: 'landing' }" class="footer__logo" aria-label="PiVault – zur Startseite">
          <AppLogo :size="32" />
        </RouterLink>
        <p class="footer__text">
          Selbst gehosteter Passwortmanager für den Raspberry Pi 5. Ein HTL-Projekt, das sich noch in Entwicklung
          befindet.
        </p>
      </div>

      <nav class="footer__col" aria-label="Seitenbereiche">
        <h2 class="footer__heading">Navigation</h2>
        <ul>
          <li v-for="item in LANDING_NAV" :key="item.label"><LandingNavLink :item="item" /></li>
        </ul>
      </nav>

      <nav class="footer__col" aria-label="Konto und Projekt">
        <h2 class="footer__heading">Konto und Projekt</h2>
        <ul>
          <template v-if="authState.user">
            <li><RouterLink :to="{ name: 'dashboard' }">Zum Dashboard</RouterLink></li>
          </template>
          <template v-else>
            <li><RouterLink :to="{ name: 'login' }">Anmelden</RouterLink></li>
            <li><RouterLink :to="{ name: 'register' }">Registrieren</RouterLink></li>
          </template>
          <li>
            <a :href="GITHUB_URL" target="_blank" rel="noopener noreferrer">
              PiVault auf GitHub<AppIcon name="external" :size="14" /><span class="sr-only"> (öffnet in neuem Tab)</span>
            </a>
          </li>
        </ul>
      </nav>
    </div>

    <div class="l-container footer__bottom">
      <p>© {{ year }} PiVault. Ein Schulprojekt, nicht für den produktiven Einsatz mit echten Zugangsdaten.</p>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  padding-top: clamp(2.5rem, 6vw, 4rem);
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
}

.footer__grid {
  display: grid;
  gap: var(--space-6);
}

.footer__logo {
  display: inline-flex;
  text-decoration: none;
}

.footer__text {
  max-width: 24rem;
  margin-top: var(--space-4);
  color: var(--text-muted);
  font-size: 0.9rem;
}

.footer__heading {
  margin-bottom: var(--space-3);
  color: var(--text-faint);
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.footer__col ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.footer__col a {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-muted);
  font-size: 0.925rem;
  text-decoration: none;
}

.footer__col a:hover {
  color: var(--text);
  text-decoration: underline;
}

.footer__bottom {
  margin-top: var(--space-6);
  padding-block: var(--space-5);
  border-top: 1px solid var(--border);
  color: var(--text-faint);
  font-size: 0.82rem;
}

@media (min-width: 760px) {
  .footer__grid {
    grid-template-columns: 1.6fr 1fr 1fr;
  }
}
</style>
