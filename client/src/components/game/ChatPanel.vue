<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { ChatMsg } from '../../net/hub';

const props = defineProps<{ messages: ChatMsg[]; opponent: string }>();
const emit = defineEmits<{ (e: 'send', text: string): void }>();
const text = ref(''),
  min = ref(false),
  input = ref<HTMLInputElement | null>(null),
  log = ref<HTMLElement | null>(null);
watch(
  () => props.messages.length,
  () =>
    nextTick(() => {
      if (log.value) log.value.scrollTop = log.value.scrollHeight;
    })
);
function send() {
  const t = text.value.trim();
  if (t) emit('send', t);
  text.value = '';
  input.value?.blur();
}
defineExpose({
  focus: () => {
    min.value = false;
    nextTick(() => input.value?.focus());
  },
});
</script>

<template>
  <div id="chatpanel" class="panel" :class="{ min }">
    <div class="head">
      Chat with {{ opponent }}<button type="button" @click="min = !min">{{ min ? '+' : '−' }}</button>
    </div>
    <div class="chat" style="flex: 1; min-height: 0">
      <div class="log" ref="log">
        <div
          v-for="(m, i) in messages"
          :key="i"
          class="m"
          :class="m.from === 'system' ? 'sys' : m.team === 0 ? 'ua' : 'ru'"
        >
          <b v-if="m.from !== 'system'">{{ m.from }}</b> {{ m.text }}
        </div>
        <div v-if="!messages.length" class="dim">Press Enter to type. Be sporting.</div>
      </div>
      <form @submit.prevent="send">
        <input ref="input" type="text" v-model="text" maxlength="400" placeholder="Message your opponent" /><button
          type="submit"
        >
          Send
        </button>
      </form>
    </div>
  </div>
</template>
