<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { drawLegend } from '../../game/render';
const cv = ref<HTMLCanvasElement | null>(null);
onMounted(() => {
  if (cv.value) drawLegend(cv.value);
});
</script>

<template>
  <div id="legendpanel" class="panel"><canvas ref="cv" /></div>
</template>
