<template>
  <ul class="skeleton" aria-hidden="true">
    <li v-for="n in 5" :key="n" class="skeleton__row">
      <span class="skeleton__avatar" />
      <span class="skeleton__lines"><span class="skeleton__line" /><span class="skeleton__line skeleton__line--short" /></span>
    </li>
  </ul>
</template>

<style scoped>
.skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.skeleton__row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.skeleton__avatar,
.skeleton__line {
  background: var(--surface-2);
  animation: pulse 1.4s ease-in-out infinite;
}

.skeleton__avatar {
  width: 2.6rem;
  height: 2.6rem;
  border-radius: var(--radius-sm);
}

.skeleton__lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.5rem;
}

.skeleton__line {
  height: 0.75rem;
  width: 45%;
  border-radius: 4px;
}

.skeleton__line--short {
  width: 30%;
}

@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}
</style>
