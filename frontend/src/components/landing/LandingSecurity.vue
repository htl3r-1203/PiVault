<script setup lang="ts">
import AppIcon from '../common/AppIcon.vue'

// Wichtig: Hier steht nur, was im Code wirklich umgesetzt ist (linke Spalte). Alles, was noch fehlt, steht
// ausdrücklich unter "Geplant" und wird nicht als verfügbar beworben.
const implemented = [
  { title: 'Registrierung und Anmeldung', text: 'Konten mit Benutzername oder E-Mail-Adresse und Login-Passwort.' },
  { title: 'Gehashte Login-Passwörter', text: 'Das Login-Passwort wird mit Argon2id gehasht gespeichert, nie im Klartext.' },
  {
    title: 'Sichere Sitzungen',
    text: 'Serverseitige Sessions mit zufälligem Token (in der Datenbank nur als Hash), HttpOnly-Cookie, festem Ablauf und Inaktivitäts-Timeout.',
  },
  { title: 'CSRF-Schutz', text: 'Schreibende Anfragen benötigen ein an die Sitzung gebundenes Token.' },
  {
    title: 'Schutz vor Brute-Force',
    text: 'Begrenzte Anmeldeversuche, ohne dass Fremde fremde Konten sperren können.',
  },
  {
    title: 'Gehärteter Webserver',
    text: 'Strikte Content-Security-Policy und Sicherheitsheader. HTTPS mit TLS 1.2/1.3, sobald ein Zertifikat hinterlegt ist.',
  },
  {
    title: 'Isolierte Infrastruktur',
    text: 'Die Datenbank ist nur im internen Docker-Netz erreichbar und hat eingeschränkte Rechte. Backups werden per Prüfsumme verifiziert.',
  },
]

const planned = [
  { title: 'Masterpasswort', text: 'Ein eigenes Passwort für den Tresor, das nie an den Server gesendet wird.' },
  { title: 'Clientseitige Verschlüsselung', text: 'Einträge werden im Browser verschlüsselt, bevor sie den Server erreichen.' },
  { title: 'Zero-Knowledge-Architektur', text: 'Der Server speichert nur verschlüsselte Daten und kann sie nicht lesen.' },
  { title: 'Persistente Tresorspeicherung', text: 'Einträge dauerhaft in der Datenbank speichern. Aktuell sind sie Demo-Daten.' },
]

const layers = [
  { name: 'Browser', text: 'Vue-Oberfläche, Passwortgenerator' },
  { name: 'Apache', text: 'Einziger Port nach außen, TLS-fähig, strikte Header' },
  { name: 'FastAPI', text: 'Sessions, CSRF, Rate-Limits, Validierung' },
  { name: 'MariaDB', text: 'Nur im internen Netz, eingeschränkte Rechte' },
]
</script>

<template>
  <section id="sicherheit" class="l-section security" aria-labelledby="security-title">
    <div class="l-container">
      <div class="l-head">
        <p class="l-eyebrow"><AppIcon name="shield" :size="16" />Sicherheit</p>
        <h2 id="security-title" class="l-title">Sicherheit im Fokus</h2>
        <p class="l-lead">
          Sicherheit ist bei einem Passwortmanager keine Nebensache. Deshalb sagen wir klar, was PiVault heute schon
          schützt und was noch fehlt.
        </p>
      </div>

      <ol class="layers" aria-label="Aufbau von PiVault">
        <li v-for="(layer, i) in layers" :key="layer.name" class="layer">
          <span class="layer__nr" aria-hidden="true">{{ i + 1 }}</span>
          <span class="layer__name">{{ layer.name }}</span>
          <span class="layer__text">{{ layer.text }}</span>
        </li>
      </ol>

      <div class="columns">
        <div class="card column column--done">
          <div class="column__head">
            <h3>Bereits umgesetzt</h3>
            <span class="badge badge--accent">Verfügbar</span>
          </div>
          <ul class="list">
            <li v-for="item in implemented" :key="item.title" class="item">
              <span class="item__icon item__icon--done"><AppIcon name="check" :size="16" /></span>
              <span>
                <strong class="item__title">{{ item.title }}</strong>
                <span class="item__text">{{ item.text }}</span>
              </span>
            </li>
          </ul>
        </div>

        <div class="card column column--planned">
          <div class="column__head">
            <h3>Geplant</h3>
            <span class="badge badge--warning">Noch nicht verfügbar</span>
          </div>
          <ul class="list">
            <li v-for="item in planned" :key="item.title" class="item">
              <span class="item__icon item__icon--planned"><AppIcon name="clock" :size="16" /></span>
              <span>
                <strong class="item__title">{{ item.title }}</strong>
                <span class="item__text">{{ item.text }}</span>
              </span>
            </li>
          </ul>
          <p class="column__warning">
            <AppIcon name="alert" :size="16" />
            Bis diese Funktionen fertig sind, gehören keine echten Zugangsdaten in PiVault. Die Tresor-Oberfläche arbeitet
            nur mit Demo-Daten.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.security {
  border-block: 1px solid var(--border);
  background: linear-gradient(180deg, var(--bg-elevated), var(--bg));
}

.layers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.layer {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.layer__nr {
  grid-row: span 2;
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.85rem;
  font-weight: 700;
}

.layer__name {
  font-weight: 700;
}

.layer__text {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.columns {
  display: grid;
  gap: var(--space-4);
}

.column {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.column--planned {
  border-style: dashed;
  border-color: var(--border-strong);
}

.column__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.item {
  display: flex;
  gap: var(--space-3);
}

.item__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  margin-top: 0.1rem;
  border-radius: 50%;
}

.item__icon--done {
  background: var(--success-soft);
  color: var(--success);
}

.item__icon--planned {
  background: var(--warning-soft);
  color: var(--warning);
}

.item__title {
  display: block;
  font-size: 0.95rem;
}

.item__text {
  display: block;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.column__warning {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin-top: auto;
  padding: var(--space-3) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
  border-radius: var(--radius-md);
  background: var(--warning-soft);
  font-size: 0.85rem;
}

.column__warning :deep(svg) {
  margin-top: 0.15rem;
  color: var(--warning);
}

@media (min-width: 900px) {
  .columns {
    grid-template-columns: 1.15fr 1fr;
  }
}
</style>
