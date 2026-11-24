<script setup lang="ts">
// Statische Mockup-Darstellung des Dashboards: rein dekorativ, nicht bedienbar (inert, aria-hidden),
// ausschließlich erfundene Beispieldaten und keine Passwörter.
import AppIcon from '../common/AppIcon.vue'
import type { IconName } from '../common/icons'

const nav: { icon: IconName; label: string; active?: boolean }[] = [
  { icon: 'list', label: 'Alle Einträge', active: true },
  { icon: 'star', label: 'Favoriten' },
  { icon: 'vault', label: 'Tresore' },
  { icon: 'refresh', label: 'Generator' },
  { icon: 'settings', label: 'Einstellungen' },
]

const rows = [
  { initial: 'B', tone: 0, name: 'Beispiel-Mail', meta: 'mail.example.com', vault: 'Privat', fav: true },
  { initial: 'L', tone: 1, name: 'Lernplattform', meta: 'lernen.example.org', vault: 'Schule', fav: true },
  { initial: 'C', tone: 1, name: 'Code-Hosting', meta: 'git.example.net', vault: 'Schule', fav: false },
  { initial: 'S', tone: 2, name: 'Streaming-Abo', meta: 'streaming.example.com', vault: 'Familie', fav: false },
]
</script>

<template>
  <div class="preview" aria-hidden="true" inert>
    <div class="preview__bar">
      <span class="preview__dot" /><span class="preview__dot" /><span class="preview__dot" />
      <span class="preview__url">pivault.local / dashboard</span>
    </div>
    <div class="preview__body">
      <div class="preview__side">
        <span v-for="item in nav" :key="item.label" class="preview__nav" :class="{ 'preview__nav--active': item.active }">
          <AppIcon :name="item.icon" :size="16" /><span class="preview__nav-label">{{ item.label }}</span>
        </span>
      </div>
      <div class="preview__main">
        <div class="preview__head">
          <span class="preview__title">Guten Tag</span>
          <span class="preview__add"><AppIcon name="plus" :size="14" />Hinzufügen</span>
        </div>
        <div class="preview__search"><AppIcon name="search" :size="14" />Einträge durchsuchen</div>
        <div v-for="row in rows" :key="row.name" class="preview__row">
          <span class="preview__avatar" :class="`preview__avatar--${row.tone}`">{{ row.initial }}</span>
          <span class="preview__text">
            <span class="preview__name">{{ row.name }}</span>
            <span class="preview__meta">{{ row.meta }}</span>
          </span>
          <span class="badge preview__vault">{{ row.vault }}</span>
          <span class="preview__star" :class="{ 'preview__star--on': row.fav }"><AppIcon name="star" :size="15" :filled="row.fav" /></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview {
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
  user-select: none;
  pointer-events: none;
}

.preview__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0.65rem var(--space-4);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.preview__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border-strong);
}

.preview__url {
  flex: 1;
  margin-left: var(--space-3);
  padding: 2px var(--space-3);
  border-radius: 999px;
  background: var(--bg);
  color: var(--text-faint);
  font-size: 0.72rem;
  text-align: center;
}

.preview__body {
  display: grid;
  grid-template-columns: 9.5rem 1fr;
  min-height: 19rem;
}

.preview__side {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3) var(--space-2);
  border-right: 1px solid var(--border);
}

.preview__nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0.45rem var(--space-2);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 0.75rem;
  white-space: nowrap;
}

.preview__nav--active {
  background: var(--accent-soft);
  color: var(--accent);
}

.preview__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-4);
}

.preview__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-1);
}

.preview__title {
  font-size: 0.95rem;
  font-weight: 700;
}

.preview__add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0.3rem 0.65rem;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 0.7rem;
  font-weight: 700;
}

.preview__search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0.5rem var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text-faint);
  font-size: 0.72rem;
}

.preview__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0.5rem var(--space-3);
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}

.preview__avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
}

.preview__avatar--0 {
  background: var(--accent-soft);
  color: var(--accent);
}
.preview__avatar--1 {
  background: var(--info-soft);
  color: var(--info);
}
.preview__avatar--2 {
  background: var(--warning-soft);
  color: var(--warning);
}

.preview__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.preview__name {
  overflow: hidden;
  font-size: 0.78rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview__meta {
  overflow: hidden;
  color: var(--text-faint);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview__vault {
  font-size: 0.65rem;
}

.preview__star {
  color: var(--text-faint);
}

.preview__star--on {
  color: var(--warning);
}

@media (max-width: 560px) {
  .preview__body {
    grid-template-columns: 1fr;
  }
  .preview__side {
    display: none;
  }
  .preview__vault {
    display: none;
  }
}
</style>
