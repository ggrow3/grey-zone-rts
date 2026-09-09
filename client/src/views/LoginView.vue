<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '../stores/auth';

const auth = useAuth(); const router = useRouter(); const route = useRoute();
const mode = ref<'login' | 'register'>('login');
const username = ref(''), password = ref(''), password2 = ref(''), error = ref(''), busy = ref(false);

async function submit() {
  error.value = '';
  if (mode.value === 'register' && password.value !== password2.value) { error.value = 'Passwords do not match'; return; }
  busy.value = true;
  try {
    if (mode.value === 'login') await auth.login(username.value.trim(), password.value);
    else await auth.register(username.value.trim(), password.value);
    router.push(String(route.query.next || '/'));
  } catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="page" style="display:flex;align-items:center;justify-content:center">
    <div class="card" style="width:min(460px,92vw)">
      <h1>Slava <span>Ukraine</span></h1>
      <div class="subtitle">Drone Wars</div>
      <p class="dim">A real-time strategy game on the Kharkiv to Belgorod axis. Play the teaching levels, fight the computer, or match against another commander and talk to them while you do.</p>
      <div class="row seg" style="margin:14px 0">
        <button type="button" :class="{ on: mode === 'login' }" @click="mode = 'login'">Sign in</button>
        <button type="button" :class="{ on: mode === 'register' }" @click="mode = 'register'">Create account</button>
      </div>
      <form @submit.prevent="submit" style="display:flex;flex-direction:column;gap:8px">
        <label>Username <input type="text" v-model="username" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" title="3 to 20 letters, digits, or underscores" style="width:100%" /></label>
        <label>Password <input type="password" v-model="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" required minlength="6" style="width:100%" /></label>
        <label v-if="mode === 'register'">Repeat password <input type="password" v-model="password2" autocomplete="new-password" required minlength="6" style="width:100%" /></label>
        <div class="err" v-if="error">{{ error }}</div>
        <button class="primary" type="submit" :disabled="busy">{{ mode === 'login' ? 'Sign in' : 'Create account and play' }}</button>
      </form>
    </div>
  </div>
</template>
