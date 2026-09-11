// Drawing the short-lived effects (explosions, tracers, barks, marks) and the shells in flight.
import { UA, RU, TEAMS } from '../data';
import type { Game } from '../sim';
import type { Effect, Projectile } from '../types';

export function drawEffects(c: CanvasRenderingContext2D, effects: Effect[], team: number, g?: Game) {
  for (const e of effects) {
    const k = e.t / e.dur;
    if (e.kind === 'alert') {
      const pulse = 0.5 + 0.5 * Math.sin(k * 40);
      c.globalAlpha = 0.5 + 0.5 * pulse;
      c.strokeStyle = '#ff5a5a';
      c.lineWidth = 3;
      c.setLineDash([8, 6]);
      c.beginPath();
      c.arc(e.x, e.y, 70 + pulse * 8, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(e.x - 14, e.y);
      c.lineTo(e.x + 14, e.y);
      c.moveTo(e.x, e.y - 14);
      c.lineTo(e.x, e.y + 14);
      c.stroke();
      c.font = '600 13px "Barlow Condensed", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(12,14,10,0.9)';
      const label = (e.text || 'STRIKE') + ' ' + Math.ceil(e.dur - e.t) + 's';
      c.strokeText(label, e.x, e.y - 84);
      c.fillStyle = '#ff8a80';
      c.fillText(label, e.x, e.y - 84);
      c.globalAlpha = 1;
    } else if (e.kind === 'bark') {
      if (e.delay && e.t < e.delay) continue;
      if (e.team !== team && g && !g.inVision(team, e.x, e.y)) continue;
      const kk = (e.t - (e.delay || 0)) / (e.dur - (e.delay || 0));
      c.globalAlpha = 1 - Math.max(0, (kk - 0.6) / 0.4);
      c.font = '600 12px "Barlow Condensed", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      const y = e.y - 18 - kk * 10;
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(12,14,10,0.9)';
      c.strokeText(e.text || '', e.x, y);
      c.fillStyle = e.team === UA ? '#ffe680' : '#ffb3a8';
      c.fillText(e.text || '', e.x, y);
      c.fillStyle = e.team === UA ? TEAMS[UA].color : TEAMS[RU].color;
      c.beginPath();
      c.arc(e.x - c.measureText(e.text || '').width / 2 - 6, y, 2.5, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    } else if (e.kind === 'boom') {
      const rr = e.r! * (0.3 + 0.7 * Math.min(1, k * 1.6));
      c.globalAlpha = 1 - k;
      const g = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr);
      g.addColorStop(0, 'rgba(255,240,180,0.95)');
      g.addColorStop(0.4, 'rgba(255,140,40,0.8)');
      g.addColorStop(1, 'rgba(60,40,20,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(e.x, e.y, rr, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = (1 - k) * 0.7;
      c.strokeStyle = '#ffb060';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(e.x, e.y, e.r! * (0.5 + k), 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    } else if (e.kind === 'tracer') {
      c.globalAlpha = 1 - k;
      c.strokeStyle = e.team === UA ? '#ffe680' : '#ff9a80';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(e.x, e.y);
      c.lineTo(e.tx!, e.ty!);
      c.stroke();
      c.globalAlpha = 1;
    } else if (e.kind === 'hit') {
      c.globalAlpha = 1 - k;
      c.fillStyle = '#fff2c0';
      c.beginPath();
      c.arc(e.x, e.y, 3 + k * 4, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    } else if (e.kind === 'flash') {
      c.globalAlpha = 1 - k;
      c.fillStyle = '#fff5d0';
      c.beginPath();
      c.arc(e.x, e.y, 5, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    } else if (e.kind === 'mark') {
      if (e.team !== undefined && e.team !== team) continue;
      c.globalAlpha = 1 - k;
      c.strokeStyle = e.red ? '#ff6b6b' : e.green ? '#8bc34a' : '#ffd60a';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(e.x, e.y, 6 + k * 18, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    } else if (e.kind === 'heal') {
      c.globalAlpha = 1 - k;
      c.fillStyle = '#8bc34a';
      c.fillRect(e.x - 1.5, e.y - 5 - k * 10, 3, 10);
      c.fillRect(e.x - 5, e.y - 1.5 - k * 10, 10, 3);
      c.globalAlpha = 1;
    } else if (e.kind === 'caught') {
      c.globalAlpha = (1 - k) * 0.8;
      c.fillStyle = '#d8d4c4';
      c.beginPath();
      c.arc(e.x, e.y, 4 + k * 10, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#d8d4c4';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(e.x - 7, e.y - 7);
      c.lineTo(e.x + 7, e.y + 7);
      c.moveTo(e.x - 7, e.y + 7);
      c.lineTo(e.x + 7, e.y - 7);
      c.stroke();
      c.globalAlpha = 1;
    } else if (e.kind === 'text') {
      if (e.team !== undefined && e.team !== team) continue;
      c.globalAlpha = 1 - k;
      c.fillStyle = '#c6e48b';
      c.font = '600 13px "Barlow Condensed", sans-serif';
      c.textAlign = 'center';
      c.fillText(e.text!, e.x, e.y - k * 18);
      c.globalAlpha = 1;
    }
  }
}

export function drawProjectiles(c: CanvasRenderingContext2D, projectiles: Projectile[]) {
  for (const p of projectiles) {
    const k = Math.min(1, p.t / p.dur),
      h = Math.sin(k * Math.PI) * p.arc;
    if (p.rocket) {
      c.strokeStyle = 'rgba(255,200,120,0.6)';
      c.lineWidth = 2;
      const bk = Math.max(0, k - 0.08),
        bx = p.sx + (p.tx - p.sx) * bk,
        by = p.sy + (p.ty - p.sy) * bk - Math.sin(bk * Math.PI) * p.arc;
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(p.x, p.y - h);
      c.stroke();
    }
    if (p.strike) {
      const ang = Math.atan2(p.ty - p.sy, p.tx - p.sx);
      c.save();
      c.translate(p.x, p.y - h);
      c.rotate(ang);
      c.fillStyle = p.strike === 'kab' ? '#3a3a3a' : '#5a5a66';
      c.strokeStyle = '#ff8a80';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(11, 0);
      c.lineTo(-7, 4);
      c.lineTo(-9, 0);
      c.lineTo(-7, -4);
      c.closePath();
      c.fill();
      c.stroke();
      if (p.strike === 'kab') {
        c.beginPath();
        c.moveTo(-2, -8);
        c.lineTo(2, 0);
        c.lineTo(-2, 8);
        c.stroke();
      }
      c.restore();
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.ellipse(p.x, p.y, 5, 3, 0, 0, Math.PI * 2);
      c.fill();
      continue;
    }
    c.fillStyle = '#f5e9c8';
    c.beginPath();
    c.arc(p.x, p.y - h, p.rocket ? 2.2 : 3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.arc(p.x, p.y, 2, 0, Math.PI * 2);
    c.fill();
  }
}
