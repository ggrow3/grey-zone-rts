// Weather fronts: announced 30 seconds ahead, rolled from the seeded RNG; snow lands the quadcopters.
import { WEATHER_TEXT } from '../data';
import type { WeatherKind } from '../types';
import type { Game } from './game';
import { MOVE } from './orders';

export function rollWeather(g: Game): WeatherKind {
  const r = g.rng.next();
  if (g.winter) return r < 0.4 ? 'clear' : r < 0.55 ? 'fog' : 'snow';
  return r < 0.6 ? 'clear' : r < 0.8 ? 'rain' : r < 0.92 ? 'fog' : 'snow';
}

export function updateWeather(g: Game) {
  const w = g.weather;
  if (!w.warned && w.until - g.gameTime <= 30) {
    w.warned = true;
    w.next = rollWeather(g);
    if (w.next === w.kind) w.next = w.kind === 'clear' ? 'rain' : 'clear';
    g.notify(-1, WEATHER_TEXT[w.next].coming);
  }
  if (g.gameTime >= w.until) {
    const kind = w.warned ? w.next : rollWeather(g);
    g.weather = {
      kind,
      until: g.gameTime + (kind === 'clear' ? g.rand(120, 300) : g.rand(90, 240)),
      next: kind,
      warned: false,
    };
    g.notify(-1, WEATHER_TEXT[kind].now);
    g.addLog(-1, 'weather', WEATHER_TEXT[kind].now);
    if (kind === 'snow')
      for (const u of g.units)
        if (!u.dead && u.def.air && u.def.electric && !u.def.large && !u.landed && !(u.def.kamikaze && u.target)) {
          const spot = g.landingSpot(u);
          if (spot) {
            u.order = MOVE(spot.x, spot.y);
            u.target = null;
          }
        }
  }
}
