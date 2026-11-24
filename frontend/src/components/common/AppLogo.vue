<script setup lang="ts">
withDefaults(defineProps<{ size?: number; showName?: boolean }>(), { size: 32, showName: true })
</script>

<template>
  <span class="logo">
    <svg :width="size" :height="size" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" class="logo__bg" />
      <path d="M16 6 8 9v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V9l-8-3z" class="logo__shield" />
      <circle cx="16" cy="14.5" r="2.2" class="logo__dot" />
      <path d="M16 16.5v3.5" class="logo__stem" />
    </svg>
    <span v-if="showName" class="logo__name">PiVault</span>
  </span>
</template>

<style scoped>
.logo {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text);
}

.logo__bg {
  fill: var(--accent-soft);
}

.logo__shield {
  stroke: var(--accent);
  stroke-width: 1.8;
  stroke-linejoin: round;
}

.logo__dot {
  fill: var(--accent);
}

.logo__stem {
  stroke: var(--accent);
  stroke-width: 1.8;
  stroke-linecap: round;
}

.logo__name {
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: -0.01em;
}
</style>
