<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '../common/AppIcon.vue'
import AppLogo from '../common/AppLogo.vue'
import LandingNavLink from './LandingNavLink.vue'
import { LANDING_NAV } from './landingNav'
import { authState } from '@/services/auth'

const route = useRoute()
const scrolled = ref(false)
const open = ref(false)
const menuButton = ref<HTMLButtonElement | null>(null)

// Ab dieser Breite ist die Navigation immer sichtbar (kein Hamburger-Menü)
const desktopQuery = window.matchMedia('(min-width: 900px)')

function onScroll() {
  scrolled.value = window.scrollY > 8
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    open.value = false
    menuButton.value?.focus()
  }
}

function onViewportChange(event: MediaQueryListEvent) {
  if (event.matches) open.value = false
}

watch(() => route.fullPath, () => (open.value = false))

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onKeydown)
  desktopQuery.addEventListener('change', onViewportChange)
  onScroll()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKeydown)
  desktopQuery.removeEventListener('change', onViewportChange)
})
</script>

<template>
  <header class="header" :class="{ 'header--solid': scrolled || open }">
    <div class="l-container header__inner">
      <RouterLink :to="{ name: 'landing' }" class="header__logo" aria-label="PiVault – zur Startseite">
        <AppLogo :size="32" />
      </RouterLink>

      <button
        ref="menuButton"
        type="button"
        class="btn btn--ghost btn--icon header__toggle"
        :aria-label="open ? 'Menü schließen' : 'Menü öffnen'"
        :aria-expanded="open"
        aria-controls="landing-menu"
        @click="open = !open"
      >
        <AppIcon :name="open ? 'close' : 'menu'" />
      </button>

      <div id="landing-menu" class="header__panel" :class="{ 'header__panel--open': open }">
        <nav aria-label="Hauptnavigation">
          <ul class="header__links">
            <li v-for="item in LANDING_NAV" :key="item.label">
              <LandingNavLink :item="item" class="header__link" @navigate="open = false" />
            </li>
          </ul>
        </nav>
        <div class="header__actions">
          <RouterLink v-if="authState.user" :to="{ name: 'dashboard' }" class="btn btn--primary">
            Zum Dashboard<AppIcon name="arrowRight" :size="16" />
          </RouterLink>
          <template v-else>
            <RouterLink :to="{ name: 'login' }" class="btn">Anmelden</RouterLink>
            <RouterLink :to="{ name: 'register' }" class="btn btn--primary">Registrieren</RouterLink>
          </template>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid transparent;
  transition:
    background var(--transition),
    border-color var(--transition),
    backdrop-filter var(--transition);
}

.header--solid {
  border-bottom-color: var(--border);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.header__inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 4rem;
}

.header__logo {
  display: inline-flex;
  border-radius: var(--radius-sm);
  text-decoration: none;
}

.header__panel {
  display: none;
}

.header__links {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.header__link {
  display: block;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-weight: 500;
  text-decoration: none;
  transition:
    color var(--transition),
    background var(--transition);
}

.header__link:hover {
  background: var(--surface-2);
  color: var(--text);
}

.header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

/* Smartphone und Tablet: ausklappbares Menü unter der Kopfzeile */
@media (max-width: 899px) {
  .header__panel--open {
    position: absolute;
    top: 100%;
    left: calc(var(--space-4) * -1);
    right: calc(var(--space-4) * -1);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-md);
  }

  .header__actions .btn {
    flex: 1;
  }
}

@media (min-width: 900px) {
  .header__toggle {
    display: none;
  }

  .header__panel {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-5);
    margin-left: var(--space-5);
  }

  .header__links {
    flex-direction: row;
    gap: var(--space-1);
  }

  .header__link {
    padding: var(--space-2) var(--space-3);
    font-size: 0.925rem;
  }
}
</style>
