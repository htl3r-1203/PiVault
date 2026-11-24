<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AlertBanner from '@/components/common/AlertBanner.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import type { IconName } from '@/components/common/icons'
import { getHealth } from '@/services/api'
import { authState } from '@/services/auth'
import { setTheme, themeState, type ThemePreference } from '@/services/preferences'

const themes: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Dunkel' },
  { value: 'light', label: 'Hell' },
  { value: 'system', label: 'System' },
]

const backendStatus = ref<'checking' | 'ok' | 'down'>('checking')

onMounted(async () => {
  try {
    backendStatus.value = (await getHealth()).status === 'ok' ? 'ok' : 'down'
  } catch {
    backendStatus.value = 'down'
  }
})

// Vorbereitete Bereiche; nichts davon ist aktiv
const planned: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'lock',
    title: 'Master-Passwort einrichten',
    text: 'Das Master-Passwort schützt später deinen Tresor und verlässt nie deinen Browser.',
  },
  {
    icon: 'shield',
    title: 'Automatische Sperre',
    text: 'Tresor nach einer Zeit der Inaktivität automatisch sperren.',
  },
  {
    icon: 'user',
    title: 'Zwei-Faktor-Authentifizierung',
    text: 'Zusätzlicher Schutz bei der Anmeldung am Server.',
  },
]
</script>

<template>
  <div class="page">
    <PageHeader title="Einstellungen" />

    <section class="card section" aria-labelledby="set-user">
      <h2 id="set-user">Benutzerinformationen</h2>
      <dl v-if="authState.user" class="info">
        <div><dt>Benutzername</dt><dd>{{ authState.user.username }}</dd></div>
        <div><dt>Name</dt><dd>{{ authState.user.first_name }} {{ authState.user.last_name }}</dd></div>
        <div>
          <dt>E-Mail-Adresse</dt>
          <dd>
            {{ authState.user.email }}
            <span class="badge" :class="authState.user.email_verified ? 'badge--accent' : 'badge--warning'">
              {{ authState.user.email_verified ? 'Bestätigt' : 'Nicht bestätigt' }}
            </span>
          </dd>
        </div>
        <div>
          <dt>Server</dt>
          <dd role="status">
            <template v-if="backendStatus === 'checking'">wird geprüft …</template>
            <span v-else class="badge" :class="backendStatus === 'ok' ? 'badge--accent' : 'badge--danger'">
              {{ backendStatus === 'ok' ? 'Erreichbar' : 'Nicht erreichbar' }}
            </span>
          </dd>
        </div>
      </dl>
    </section>

    <section class="card section" aria-labelledby="set-design">
      <h2 id="set-design">Design</h2>
      <fieldset class="themes">
        <legend class="field__label">Farbschema</legend>
        <label v-for="t in themes" :key="t.value" class="theme-option" :class="{ 'theme-option--on': themeState.preference === t.value }">
          <input
            type="radio"
            name="theme"
            class="sr-only"
            :value="t.value"
            :checked="themeState.preference === t.value"
            @change="setTheme(t.value)"
          />
          {{ t.label }}
        </label>
      </fieldset>
      <p class="field__hint">Die Auswahl wird nur in diesem Browser gespeichert.</p>
    </section>

    <section class="card section" aria-labelledby="set-security">
      <div class="section__head">
        <h2 id="set-security">Sicherheit</h2>
        <span class="badge badge--warning">Noch nicht verfügbar</span>
      </div>
      <AlertBanner variant="warning">
        Die clientseitige Verschlüsselung und das Master-Passwort sind noch nicht umgesetzt. Die Tresordaten dieser
        Oberfläche sind Demo-Daten und werden nicht geschützt gespeichert.
      </AlertBanner>
      <ul class="planned">
        <li v-for="item in planned" :key="item.title" class="planned__item">
          <span class="planned__icon"><AppIcon :name="item.icon" :size="20" /></span>
          <span class="planned__text">
            <span class="planned__title">{{ item.title }}</span>
            <span class="planned__desc">{{ item.text }}</span>
          </span>
          <button type="button" class="btn btn--sm" disabled>Noch nicht verfügbar</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 48rem;
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.section__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: var(--space-4);
  margin: 0;
}

.info dt {
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 600;
}

.info dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.themes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.themes legend {
  width: 100%;
  margin-bottom: var(--space-2);
  padding: 0;
}

.theme-option {
  display: inline-flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0 var(--space-5);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-weight: 600;
  font-size: 0.925rem;
  cursor: pointer;
}

.theme-option:hover {
  background: var(--surface-hover);
}

.theme-option--on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.theme-option:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.planned {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.planned__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}

.planned__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-muted);
}

.planned__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 12rem;
}

.planned__title {
  font-weight: 600;
}

.planned__desc {
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
