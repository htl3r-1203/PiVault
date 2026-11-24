<script setup lang="ts">
import { computed } from 'vue'
import { strengthOf } from '@/services/passwordGenerator'

const props = defineProps<{ bits: number }>()
const strength = computed(() => strengthOf(props.bits))
const filled = computed(() => ({ weak: 1, fair: 2, good: 3, strong: 4 })[strength.value.level])
</script>

<template>
  <div class="meter" :class="`meter--${strength.level}`">
    <div class="meter__bars" aria-hidden="true">
      <span v-for="n in 4" :key="n" class="meter__bar" :class="{ 'meter__bar--on': n <= filled }" />
    </div>
    <span class="meter__label">{{ strength.label }} · ca. {{ bits }} Bit</span>
  </div>
</template>

<style scoped>
.meter {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: 0.85rem;
  color: var(--text-muted);
}

.meter__bars {
  display: grid;
  grid-template-columns: repeat(4, 2.25rem);
  gap: 4px;
}

.meter__bar {
  height: 6px;
  border-radius: 3px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.meter--weak .meter__bar--on {
  background: var(--danger);
  border-color: var(--danger);
}
.meter--fair .meter__bar--on {
  background: var(--warning);
  border-color: var(--warning);
}
.meter--good .meter__bar--on,
.meter--strong .meter__bar--on {
  background: var(--success);
  border-color: var(--success);
}
</style>
