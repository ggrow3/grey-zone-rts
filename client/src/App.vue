<script setup lang="ts">
import { useAuth } from './stores/auth';
import { useRoute, useRouter } from 'vue-router';
import { computed, onMounted } from 'vue';
import { hub } from './net/hub';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const inGame = computed(() => ['level', 'skirmish', 'match'].includes(String(route.name)));
onMounted(() => { if (auth.loggedIn) auth.refresh(); });
async function logout() { await hub.disconnect(); auth.logout(); router.push({ name: 'login' }); }
</script>

<template>
  <div id="shell">
    <nav id="nav" v-if="!inGame">
      <router-link to="/" class="brand">Slava <span>Ukraine</span> <small>Drone Wars</small></router-link>
      <template v-if="auth.loggedIn">
        <router-link to="/">Play</router-link>
        <router-link to="/lobby">Lobby</router-link>
        <router-link to="/history">Game log</router-link>
        <span class="spacer" />
        <span class="user">{{ auth.username }} <small>({{ auth.wins }}W / {{ auth.losses }}L)</small></span>
        <button type="button" @click="logout">Sign out</button>
      </template>
    </nav>
    <router-view :key="$route.fullPath" />
  </div>
</template>
