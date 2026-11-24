<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '../common/AppIcon.vue'
import AppLogo from '../common/AppLogo.vue'
import type { IconName } from '../common/icons'
import { useVault } from '@/composables/useVault'
import { authState, logout } from '@/services/auth'
import { initialOf } from '@/utils/format'

defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ toggle: []; navigate: [] }>()

const router = useRouter()
const vault = useVault()
const signingOut = ref(false)

interface NavItem {
  name: string
  label: string
  icon: IconName
  count?: number
}

const items = computed<NavItem[]>(() => {
  const ready = vault.state.status === 'ready'
  return [
    { name: 'home', label: 'Alle Einträge', icon: 'list', count: ready ? vault.state.entries.length : undefined },
    {
      name: 'favorites',
      label: 'Favoriten',
      icon: 'star',
      count: ready ? vault.state.entries.filter((e) => e.favorite).length : undefined,
    },
    { name: 'vaults', label: 'Tresore', icon: 'vault' },
    { name: 'generator', label: 'Passwortgenerator', icon: 'refresh' },
    { name: 'settings', label: 'Einstellungen', icon: 'settings' },
  ]
})

const displayName = computed(() => {
  const u = authState.user
  return u ? `${u.first_name} ${u.last_name}`.trim() || u.username : ''
})

async function signOut() {
  signingOut.value = true
  try {
    await logout()
  } finally {
    signingOut.value = false
    await router.push({ name: 'login' })
  }
}
</script>

<template>
  <div class="nav" :class="{ 'nav--collapsed': collapsed }">
    <div class="nav__brand">
      <AppLogo :show-name="!collapsed" />
    </div>

    <nav class="nav__main" aria-label="Hauptnavigation">
      <ul>
        <li v-for="item in items" :key="item.name">
          <RouterLink
            :to="{ name: item.name }"
            class="nav__link"
            active-class=""
            exact-active-class="nav__link--active"
            :title="collapsed ? item.label : undefined"
            @click="emit('navigate')"
          >
            <AppIcon :name="item.icon" />
            <span class="nav__label" :class="{ 'sr-only': collapsed }">{{ item.label }}</span>
            <span v-if="item.count !== undefined && !collapsed" class="nav__count">{{ item.count }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>

    <div class="nav__footer">
      <div v-if="authState.user" class="nav__user" :title="collapsed ? displayName : undefined">
        <span class="nav__avatar" aria-hidden="true">{{ initialOf(displayName) }}</span>
        <span v-if="!collapsed" class="nav__user-text">
          <span class="nav__user-name">{{ displayName }}</span>
          <span class="nav__user-sub">@{{ authState.user.username }}</span>
        </span>
      </div>
      <button
        type="button"
        class="nav__link nav__button"
        :disabled="signingOut"
        :title="collapsed ? 'Abmelden' : undefined"
        @click="signOut"
      >
        <AppIcon name="logout" />
        <span class="nav__label" :class="{ 'sr-only': collapsed }">Abmelden</span>
      </button>
      <button
        type="button"
        class="nav__link nav__button nav__collapse"
        :aria-label="collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'"
        :aria-expanded="!collapsed"
        :title="collapsed ? 'Seitenleiste ausklappen' : undefined"
        @click="emit('toggle')"
      >
        <AppIcon :name="collapsed ? 'chevronRight' : 'chevronLeft'" />
        <span v-if="!collapsed" class="nav__label">Einklappen</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  height: 100%;
  padding: var(--space-4) var(--space-3);
}

.nav__brand {
  padding: var(--space-1) var(--space-2) var(--space-2);
  min-height: 2.5rem;
}

.nav--collapsed .nav__brand {
  display: flex;
  justify-content: center;
  padding-inline: 0;
}

.nav__main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.nav__main ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.nav__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 2.6rem;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.95rem;
  text-align: left;
  text-decoration: none;
  transition:
    background var(--transition),
    color var(--transition);
}

.nav__link:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.nav__link--active,
.nav__link--active:hover {
  background: var(--accent-soft);
  color: var(--accent);
}

.nav--collapsed .nav__link {
  justify-content: center;
  padding: 0;
}

.nav__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav__count {
  padding: 0 0.5rem;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4rem;
}

.nav__link--active .nav__count {
  background: var(--accent-soft);
  color: var(--accent);
}

.nav__footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.nav__user {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-2) var(--space-3);
}

.nav--collapsed .nav__user {
  justify-content: center;
  padding-inline: 0;
}

.nav__avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
  font-size: 0.9rem;
}

.nav__user-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.nav__user-name,
.nav__user-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav__user-name {
  font-size: 0.9rem;
  font-weight: 600;
}

.nav__user-sub {
  font-size: 0.78rem;
  color: var(--text-faint);
}

.nav__button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* Einklappen gibt es nur auf großen Bildschirmen; mobil ist die Leiste ein Drawer */
@media (max-width: 859px) {
  .nav__collapse {
    display: none;
  }
}
</style>
