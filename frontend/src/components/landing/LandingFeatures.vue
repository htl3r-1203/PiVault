<script setup lang="ts">
import AppIcon from '../common/AppIcon.vue'
import type { IconName } from '../common/icons'

type Status = 'available' | 'demo'

// Der Status ist ehrlich gekennzeichnet: "Demo" = Oberfläche vorhanden, Daten aber nur Beispieldaten im Browser-Speicher
const features: { icon: IconName; title: string; text: string; status: Status }[] = [
  {
    icon: 'lock',
    title: 'Passwortverwaltung',
    text: 'Zugangsdaten anlegen, ansehen, bearbeiten und löschen, mit Anzeigen/Verbergen und Kopierfunktion.',
    status: 'demo',
  },
  {
    icon: 'refresh',
    title: 'Passwortgenerator',
    text: 'Zufällige Passwörter mit einstellbarer Länge und Zeichenarten, direkt im Browser erzeugt.',
    status: 'available',
  },
  {
    icon: 'vault',
    title: 'Tresore und Organisation',
    text: 'Einträge in Tresoren ordnen, etwa privat, Schule oder Familie, und nach Tresor filtern.',
    status: 'demo',
  },
  {
    icon: 'search',
    title: 'Suche und Favoriten',
    text: 'Einträge nach Name, Benutzername oder Website finden und wichtige Zugänge als Favoriten markieren.',
    status: 'demo',
  },
  {
    icon: 'server',
    title: 'Selbst gehostete Infrastruktur',
    text: 'Läuft per Docker Compose auf deinem eigenen Raspberry Pi 5. Deine Daten bleiben auf deiner Hardware.',
    status: 'available',
  },
  {
    icon: 'monitor',
    title: 'Responsive Weboberfläche',
    text: 'Eine Oberfläche für Desktop, Tablet und Smartphone, mit Tastaturbedienung und dunklem oder hellem Design.',
    status: 'available',
  },
]
</script>

<template>
  <section id="funktionen" class="l-section" aria-labelledby="features-title">
    <div class="l-container">
      <div class="l-head">
        <p class="l-eyebrow">Funktionen</p>
        <h2 id="features-title" class="l-title">Alles, was du für deine Zugangsdaten brauchst</h2>
        <p class="l-lead">
          Eine klare Oberfläche für den Alltag. Bei jeder Funktion steht, was schon nutzbar ist und was noch als
          Demo dient.
        </p>
      </div>

      <ul class="grid">
        <li v-for="f in features" :key="f.title" class="card feature">
          <span class="feature__icon"><AppIcon :name="f.icon" :size="22" /></span>
          <div class="feature__head">
            <h3 class="feature__title">{{ f.title }}</h3>
            <span class="badge" :class="f.status === 'available' ? 'badge--accent' : 'badge--warning'">
              {{ f.status === 'available' ? 'Verfügbar' : 'Demo-Oberfläche' }}
            </span>
          </div>
          <p class="feature__text">{{ f.text }}</p>
        </li>
      </ul>

      <p class="note">
        <AppIcon name="info" :size="16" />
        „Demo-Oberfläche“ bedeutet: Die Bedienung funktioniert, die Einträge sind aber Beispieldaten im Arbeitsspeicher
        und werden noch nicht gespeichert oder verschlüsselt.
      </p>
    </div>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
  gap: var(--space-4);
}

.feature {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  transition:
    transform var(--transition),
    border-color var(--transition),
    background var(--transition);
}

.feature:hover {
  transform: translateY(-3px);
  border-color: var(--border-strong);
  background: var(--surface-hover);
}

.feature__icon {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
}

.feature__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.feature__text {
  color: var(--text-muted);
  font-size: 0.925rem;
}

.note {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin-top: var(--space-5);
  color: var(--text-muted);
  font-size: 0.85rem;
}

.note :deep(svg) {
  margin-top: 0.2rem;
  color: var(--info);
}
</style>
