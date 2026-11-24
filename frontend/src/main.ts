import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from './services/api'
import { clearUser } from './services/auth'
import { initTheme } from './services/preferences'
import './assets/styles/tokens.css'
import './assets/styles/base.css'
import './assets/styles/ui.css'

initTheme()

// Läuft die Session ab, während die Seite offen ist: zurück zur Anmeldung
setUnauthorizedHandler(() => {
  clearUser()
  const current = router.currentRoute.value
  if (current.meta.requiresAuth) {
    void router.push({ name: 'login', query: { redirect: current.fullPath } })
  }
})

createApp(App).use(router).mount('#app')
