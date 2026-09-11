import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
    { path: '/lobby', name: 'lobby', component: () => import('../views/LobbyView.vue') },
    { path: '/history', name: 'history', component: () => import('../views/HistoryView.vue') },
    {
      path: '/play/level/:id',
      name: 'level',
      component: () => import('../views/GameView.vue'),
      props: r => ({ mode: 'level', levelId: r.params.id }),
    },
    {
      path: '/play/skirmish',
      name: 'skirmish',
      component: () => import('../views/GameView.vue'),
      props: r => ({
        mode: 'skirmish',
        side: Number(r.query.side ?? 0),
        difficulty: Number(r.query.diff ?? 0.7),
        start: String(r.query.start || 'standard'),
        replay: r.query.replay === '1',
        map: String(r.query.map || 'kharkiv'),
      }),
    },
    {
      path: '/match/:id',
      name: 'match',
      component: () => import('../views/GameView.vue'),
      props: r => ({ mode: 'multiplayer', matchId: r.params.id }),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(to => {
  const auth = useAuth();
  if (!to.meta.public && !auth.loggedIn) return { name: 'login', query: { next: to.fullPath } };
  if (to.name === 'login' && auth.loggedIn) return { name: 'home' };
});

export default router;
