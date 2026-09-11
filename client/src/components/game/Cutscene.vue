<script setup lang="ts">
// Mission briefing: narrated lines over slow camera pans, before the clock starts.
defineProps<{ title: string; side: number; lines: string[]; index: number }>();
defineEmits<{ (e: 'next'): void; (e: 'skip'): void }>();
</script>

<template>
  <div id="cutscene" :class="{ ru: side === 1 }" @click="$emit('next')">
    <div class="bars top" />
    <div class="bars bottom" />
    <div class="card">
      <div class="kicker">
        {{ side === 0 ? 'Ukrainian Armed Forces, Kharkiv group' : 'Russian Armed Forces, Belgorod group' }} · briefing
      </div>
      <h1>{{ title }}</h1>
      <div class="lines">
        <p v-for="(l, i) in lines.slice(0, index + 1)" :key="i" :class="{ now: i === index, past: i < index }">
          {{ l }}
        </p>
      </div>
      <div class="foot">
        <span class="dots"><i v-for="(_, i) in lines" :key="i" :class="{ on: i <= index }" /></span>
        <span class="dim">Click or press Space for the next line</span>
        <button type="button" @click.stop="$emit('skip')">
          {{ index >= lines.length - 1 ? 'Begin (Enter)' : 'Skip briefing (Esc)' }}
        </button>
      </div>
    </div>
  </div>
</template>
