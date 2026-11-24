<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppIcon from '../common/AppIcon.vue'
import AppLogo from '../common/AppLogo.vue'
import SidebarNav from './SidebarNav.vue'
import { useVault } from '@/composables/useVault'
import { getSidebarCollapsed, setSidebarCollapsed } from '@/services/preferences'

const route = useRoute()
const vault = useVault()

const collapsed = ref(getSidebarCollapsed())
const mobileOpen = ref(false)
const menuButton = ref<HTMLButtonElement | null>(null)
const sidebar = ref<HTMLElement | null>(null)

// Unter 860 px ist die Seitenleiste ein Drawer und immer ausführlich beschriftet
const mobileQuery = window.matchMedia('(max-width: 859px)')
const isMobile = ref(mobileQuery.matches)
function onViewportChange(event: MediaQueryListEvent) {
  isMobile.value = event.matches
  if (!event.matches) mobileOpen.value = false
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  setSidebarCollapsed(collapsed.value)
}

async function openMobile() {
  mobileOpen.value = true
  await nextTick()
  sidebar.value?.querySelector<HTMLElement>('a, button')?.focus()
}

function closeMobile(restoreFocus = false) {
  if (!mobileOpen.value) return
  mobileOpen.value = false
  if (restoreFocus) menuButton.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && mobileOpen.value) closeMobile(true)
}

watch(() => route.fullPath, () => closeMobile())

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  mobileQuery.addEventListener('change', onViewportChange)
  void vault.ensureLoaded()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  mobileQuery.removeEventListener('change', onViewportChange)
})
</script>

<template>
  <div class="shell" :class="{ 'shell--collapsed': collapsed }">
    <a class="skip-link" href="#main">Zum Inhalt springen</a>

    <aside
      id="sidebar"
      ref="sidebar"
      class="shell__sidebar"
      :class="{ 'shell__sidebar--open': mobileOpen }"
    >
      <SidebarNav :collapsed="collapsed && !isMobile" @toggle="toggleCollapsed" @navigate="closeMobile()" />
    </aside>
    <div v-if="mobileOpen" class="shell__scrim" aria-hidden="true" @click="closeMobile(true)" />

    <div class="shell__content" :inert="mobileOpen">
      <header class="topbar">
        <button
          ref="menuButton"
          type="button"
          class="btn btn--ghost btn--icon"
          aria-label="Menü öffnen"
          aria-controls="sidebar"
          :aria-expanded="mobileOpen"
          @click="openMobile"
        >
          <AppIcon name="menu" />
        </button>
        <AppLogo :size="28" />
      </header>
      <main id="main" class="shell__main" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
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

.shell__sidebar {
  position: sticky;
  top: 0;
  flex: none;
  width: var(--sidebar-width);
  height: 100vh;
  height: 100dvh;
  border-right: 1px solid var(--border);
  background: var(--bg-elevated);
  transition: width var(--transition);
}

.shell--collapsed .shell__sidebar {
  width: var(--sidebar-width-collapsed);
}

.shell__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.shell__main {
  flex: 1;
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  padding: var(--space-6) var(--space-6) var(--space-7);
}

.shell__main:focus {
  outline: none;
}

.topbar {
  display: none;
}

/* Tablet und Smartphone: Sidebar als Drawer */
@media (max-width: 859px) {
  .shell__sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 40;
    width: min(18rem, 86vw);
    box-shadow: var(--shadow-lg);
    transform: translateX(-100%);
    visibility: hidden;
    transition:
      transform 200ms ease,
      visibility 0s linear 200ms;
  }

  .shell--collapsed .shell__sidebar {
    width: min(18rem, 86vw);
  }

  .shell__sidebar--open {
    transform: none;
    visibility: visible;
    transition-delay: 0s;
  }

  .shell__scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: var(--scrim);
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border);
    background: var(--bg-elevated);
  }

  .shell__main {
    padding: var(--space-5) var(--space-4) var(--space-6);
  }
}
</style>
