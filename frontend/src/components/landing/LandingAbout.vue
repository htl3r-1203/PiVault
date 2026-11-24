<script setup lang="ts">
import AppIcon from '../common/AppIcon.vue'
import type { IconName } from '../common/icons'

const points: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'key',
    title: 'Ziel des Projekts',
    text: 'Zugangsdaten auf eigener Hardware verwalten, statt sie Cloud-Anbietern oder dem Browser anzuvertrauen.',
  },
  {
    icon: 'server',
    title: 'Selbst gehostete Architektur',
    text: 'Drei Docker-Container (Apache, FastAPI, MariaDB) auf einem Raspberry Pi 5. Nur der Webserver ist erreichbar.',
  },
  {
    icon: 'shield',
    title: 'Datenschutz und Benutzerfreundlichkeit',
    text: 'Deine Daten bleiben bei dir, die Oberfläche soll dabei übersichtlich und leicht bedienbar bleiben.',
  },
]

const tech = ['Vue 3', 'TypeScript', 'Vite', 'FastAPI', 'Python', 'MariaDB', 'Apache', 'Docker Compose', 'Raspberry Pi 5']
</script>

<template>
  <section id="ueber" class="l-section" aria-labelledby="about-title">
    <div class="l-container about">
      <div class="about__intro">
        <p class="l-eyebrow">Über PiVault</p>
        <h2 id="about-title" class="l-title">Ein selbst entwickeltes Softwareprojekt</h2>
        <p class="l-lead">
          PiVault entsteht im Rahmen eines HTL-Projekts und ist noch in Entwicklung. Der Fokus liegt darauf, einen
          Passwortmanager nachvollziehbar und sicher aufzubauen, Schritt für Schritt.
        </p>
        <ul class="tech" aria-label="Verwendete Technologien">
          <li v-for="t in tech" :key="t" class="badge tech__item">{{ t }}</li>
        </ul>
      </div>

      <ul class="points">
        <li v-for="p in points" :key="p.title" class="card point">
          <span class="point__icon"><AppIcon :name="p.icon" :size="20" /></span>
          <div>
            <h3 class="point__title">{{ p.title }}</h3>
            <p class="point__text">{{ p.text }}</p>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.about {
  display: grid;
  gap: clamp(2rem, 5vw, 3.5rem);
  align-items: start;
}

.tech {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-5);
}

.tech__item {
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--border);
  font-size: 0.8rem;
}

.points {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.point {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
}

.point__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
}

.point__text {
  margin-top: var(--space-1);
  color: var(--text-muted);
  font-size: 0.9rem;
}

@media (min-width: 900px) {
  .about {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
