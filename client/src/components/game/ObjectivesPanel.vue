<script setup lang="ts">
import type { Level } from '../../game/levels';
defineProps<{ level: Level; index: number }>();
defineEmits<{ (e: 'skip'): void }>();
</script>

<template>
  <div id="objectives" class="panel">
    <div class="head"><span class="step">{{ Math.min(index + 1, level.objectives.length) }} / {{ level.objectives.length }}</span><span class="title">{{ level.objectives[Math.min(index, level.objectives.length - 1)].title }}</span></div>
    <div class="text">{{ level.objectives[Math.min(index, level.objectives.length - 1)].text }}</div>
    <ol><li v-for="(o, i) in level.objectives" :key="i" :class="{ done: i < index, now: i === index }">{{ o.title }}</li></ol>
    <div style="margin-top:8px"><button type="button" style="padding:3px 9px;font-size:12px" @click="$emit('skip')" v-if="index < level.objectives.length - 1">Skip step</button></div>
  </div>
</template>
