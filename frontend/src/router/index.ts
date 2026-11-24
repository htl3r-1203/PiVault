import { createRouter, createWebHistory } from 'vue-router'
import LandingView from '../views/LandingView.vue'
import { authState, loadUser } from '@/services/auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
    /** Welche Einträge das Dashboard zeigt */
    scope?: 'all' | 'favorites'
  }
}

// Routen, die auf derselben Seite (Landingpage) liegen: Startseite und die beiden Dialoge
const DIALOG_ROUTES = ['landing', 'login', 'register']

// Die Landingpage ist der Einstieg und wird sofort geladen. Alles andere (Anmeldung, Dashboard,
// Generator, Einstellungen) wird erst bei Bedarf nachgeladen, damit das Start-Bundle klein bleibt.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      // Startseite. Anmeldung und Registrierung sind Kind-Routen: Sie rendern als Dialog über der Landingpage
      // (LandingView enthält dafür ein <RouterView />), eigene URLs bleiben erhalten.
      path: '/',
      name: 'landing',
      component: LandingView,
      children: [
        {
          path: 'login',
          name: 'login',
          component: () => import('../views/LoginView.vue'),
          meta: { guestOnly: true },
        },
        {
          path: 'register',
          name: 'register',
          component: () => import('../views/RegisterView.vue'),
          meta: { guestOnly: true },
        },
      ],
    },
    {
      // Geschützter Bereich mit Sidebar; alle Kindrouten benötigen eine Session.
      // Der Pfad "/app" ist nur ein interner Platzhalter für das Layout (die Kinder haben absolute Pfade wie
      // "/dashboard"). Ein pfadloses Layout würde sonst ebenfalls auf "/" passen und die Landingpage überdecken.
      path: '/app',
      component: () => import('../components/layout/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: { name: 'dashboard' } },
        {
          path: '/dashboard',
          name: 'dashboard',
          component: () => import('../views/HomeView.vue'),
          meta: { scope: 'all' },
        },
        {
          path: '/favorites',
          name: 'favorites',
          component: () => import('../views/HomeView.vue'),
          meta: { scope: 'favorites' },
        },
        { path: '/vaults', name: 'vaults', component: () => import('../views/VaultsView.vue') },
        { path: '/generator', name: 'generator', component: () => import('../views/GeneratorView.vue') },
        { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue') },
      ],
    },
    // Unbekannte Pfade führen zur öffentlichen Startseite (kein Redirect-Loop: "/" ist immer erreichbar)
    { path: '/:pathMatch(.*)*', redirect: { name: 'landing' } },
  ],
  scrollBehavior(to, from, savedPosition) {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // 64 px Versatz für den Sticky-Header der Landingpage
    if (to.hash) return { el: to.hash, top: 64, behavior: smooth ? 'smooth' : 'auto' }
    if (savedPosition) return savedPosition
    // Öffnen/Schließen des Anmelde-Dialogs: Die Startseite dahinter bleibt an ihrer Scrollposition
    if (!to.hash && to.name !== from.name && DIALOG_ROUTES.includes(String(to.name)) && DIALOG_ROUTES.includes(String(from.name))) {
      return false
    }
    // Reine Query-Änderungen (z. B. Tresor-Filter im Dashboard) behalten die Scrollposition
    if (to.path === from.path && to.hash === from.hash) return false
    return { top: 0 }
  },
})

// Geschützte Ansichten nur mit gültiger Session; der Status kommt von /api/auth/me.
// Die Landingpage ist öffentlich, zeigt angemeldeten Benutzern aber einen Link zum Dashboard.
router.beforeEach(async (to) => {
  if (!authState.loaded) {
    await loadUser()
  }
  if (to.meta.requiresAuth && !authState.user) {
    return { name: 'login', query: to.fullPath === '/dashboard' ? {} : { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && authState.user) {
    return { name: 'dashboard' }
  }
})

export default router
