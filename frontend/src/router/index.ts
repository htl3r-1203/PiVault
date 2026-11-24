import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../components/layout/AppLayout.vue'
import GeneratorView from '../views/GeneratorView.vue'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import SettingsView from '../views/SettingsView.vue'
import VaultsView from '../views/VaultsView.vue'
import { authState, loadUser } from '@/services/auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
    /** Welche Einträge das Dashboard zeigt */
    scope?: 'all' | 'favorites'
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      // Geschützter Bereich mit Sidebar; alle Kindrouten benötigen eine Session
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'home', component: HomeView, meta: { scope: 'all' } },
        { path: 'favorites', name: 'favorites', component: HomeView, meta: { scope: 'favorites' } },
        { path: 'vaults', name: 'vaults', component: VaultsView },
        { path: 'generator', name: 'generator', component: GeneratorView },
        { path: 'settings', name: 'settings', component: SettingsView },
      ],
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
      meta: { guestOnly: true },
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
  ],
})

// Geschützte Ansichten nur mit gültiger Session; der Status kommt von /api/auth/me
router.beforeEach(async (to) => {
  if (!authState.loaded) {
    await loadUser()
  }
  if (to.meta.requiresAuth && !authState.user) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && authState.user) {
    return { name: 'home' }
  }
})

export default router
