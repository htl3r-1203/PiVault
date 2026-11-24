<script setup lang="ts">
// Echter Link (<a href>) mit Router-Navigation. Bewusst kein RouterLink: Alle Anker zeigen auf dieselbe
// Route, RouterLink würde sie sonst alle als "aktuelle Seite" (aria-current) markieren.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { LandingNavItem } from './landingNav'

const props = defineProps<{ item: LandingNavItem }>()
const emit = defineEmits<{ navigate: [] }>()

const router = useRouter()
const href = computed(() => router.resolve(props.item.to).href)

function go(event: MouseEvent) {
  // Modifier-Klicks (neuer Tab usw.) dem Browser überlassen
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  void router.push(props.item.to)
  emit('navigate')
}
</script>

<template>
  <a :href="href" @click="go"><slot>{{ item.label }}</slot></a>
</template>
