// Drawing buildings, civilian sites, towns, and gas and wheat sites.
import { UA, RU, TEAMS } from '../data';
import type { Struct, Site, Effect } from '../types';
import { hpBar } from './shapes';

export function drawFootprintShadow(c: CanvasRenderingContext2D, s: Struct) {
  if (s.def.trench || s.def.netR) return;
  c.save();
  c.translate(s.x + 4, s.y + 7);
  c.globalAlpha = 0.32;
  c.fillStyle = '#000';
  c.beginPath();
  c.ellipse(0, 0, s.r * 1.15, s.r * 0.85, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

export function drawCiv(c: CanvasRenderingContext2D, s: Struct) {
  const r = s.r;
  drawFootprintShadow(c, s);
  c.save();
  c.translate(s.x, s.y);
  c.lineWidth = 1.5;
  c.strokeStyle = '#5d584c';
  switch (s.type) {
    case 'apartments':
      c.fillStyle = '#c9c2ad';
      c.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.fillStyle = '#4a4640';
      for (let i = -2; i <= 2; i++)
        for (let j = -1; j <= 1; j++) c.fillRect(i * r * 0.36 - 1.5, j * r * 0.42 - 1.5, 3, 3);
      break;
    case 'hospital':
      c.fillStyle = '#efeadf';
      c.fillRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.fillStyle = '#c1121f';
      c.fillRect(-r * 0.15, -r * 0.5, r * 0.3, r);
      c.fillRect(-r * 0.5, -r * 0.15, r, r * 0.3);
      break;
    case 'school':
      c.fillStyle = '#d6c9a5';
      c.fillRect(-r, -r * 0.6, r * 2, r * 1.2);
      c.strokeRect(-r, -r * 0.6, r * 2, r * 1.2);
      c.beginPath();
      c.moveTo(-r, -r * 0.6);
      c.lineTo(0, -r * 1.1);
      c.lineTo(r, -r * 0.6);
      c.stroke();
      break;
    case 'power':
      c.fillStyle = '#9a978c';
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.strokeStyle = '#ffd60a';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(r * 0.2, -r * 0.7);
      c.lineTo(-r * 0.3, 0);
      c.lineTo(r * 0.2, 0);
      c.lineTo(-r * 0.2, r * 0.7);
      c.stroke();
      break;
    case 'market':
      c.fillStyle = '#d9b98a';
      c.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.fillStyle = '#b5563a';
      for (let i = 0; i < 4; i++) c.fillRect(-r + i * r * 0.5, -r * 0.7, r * 0.25, r * 0.4);
      break;
  }
  c.fillStyle = 'rgba(232,228,212,0.85)';
  c.font = '10px Barlow, sans-serif';
  c.textAlign = 'center';
  c.fillText(s.def.label, 0, r + 12);
  if (s.hp < s.def.hp) hpBar(c, -r, -r - 9, r * 2, s.hp / s.def.hp);
  c.restore();
}

export function drawStruct(c: CanvasRenderingContext2D, s: Struct) {
  if (s.civ) return drawCiv(c, s);
  drawFootprintShadow(c, s);
  const team = TEAMS[s.team],
    r = s.r;
  c.save();
  c.translate(s.x, s.y);
  c.fillStyle = team.dark;
  c.strokeStyle = team.color;
  c.lineWidth = 2;
  if (s.build < 1) c.setLineDash([6, 5]);
  switch (s.type) {
    case 'hq':
      c.fillRect(-r, -r, r * 2, r * 2);
      c.strokeRect(-r, -r, r * 2, r * 2);
      c.strokeRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1);
      c.fillStyle = team.stroke;
      c.fillRect(-r * 0.2, -r * 0.2, r * 0.4, r * 0.4);
      break;
    case 'barracks':
      c.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.beginPath();
      c.moveTo(-r, 0);
      c.lineTo(r, 0);
      c.stroke();
      break;
    case 'droneWorks':
      c.fillRect(-r, -r, r * 2, r * 2);
      c.strokeRect(-r, -r, r * 2, r * 2);
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const px = Math.cos(a) * r * 0.55,
          py = Math.sin(a) * r * 0.55;
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      }
      c.closePath();
      c.stroke();
      break;
    case 'armorPlant':
      c.fillRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.strokeRect(-r * 0.7, -r * 0.4, r * 0.6, r * 0.8);
      c.strokeRect(r * 0.1, -r * 0.4, r * 0.6, r * 0.8);
      break;
    case 'artyDepot':
      c.fillRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.fillStyle = team.color;
      for (const x of [-r * 0.5, 0, r * 0.5]) {
        c.beginPath();
        c.arc(x, 0, r * 0.14, 0, Math.PI * 2);
        c.fill();
      }
      break;
    case 'radar':
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(0, r * 0.2, r * 0.6, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
      c.beginPath();
      c.moveTo(0, r * 0.2);
      c.lineTo(0, -r * 0.6);
      c.stroke();
      break;
    case 'ewStation':
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(0, 0, r * 0.2, 0, Math.PI * 2);
      c.stroke();
      break;
    case 'trench':
      c.strokeStyle = '#3a2f1e';
      c.lineWidth = 5;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-20, -4);
      c.lineTo(-10, 4);
      c.lineTo(0, -4);
      c.lineTo(10, 4);
      c.lineTo(20, -4);
      c.stroke();
      c.strokeStyle = '#8a7a58';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-20, -8);
      c.lineTo(-10, 0);
      c.lineTo(0, -8);
      c.lineTo(10, 0);
      c.lineTo(20, -8);
      c.stroke();
      break;
    case 'pylon':
      c.strokeStyle = team.color;
      c.lineWidth = 2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-7, 9);
      c.lineTo(0, -11);
      c.lineTo(7, 9);
      c.moveTo(-8, -4);
      c.lineTo(8, -4);
      c.moveTo(-5, 3);
      c.lineTo(5, 3);
      c.stroke();
      c.fillStyle = team.stroke;
      c.beginPath();
      c.arc(0, -11, 2, 0, Math.PI * 2);
      c.fill();
      break;
    case 'powerPlant':
      c.fillRect(-r, -r * 0.75, r * 2, r * 1.5);
      c.strokeRect(-r, -r * 0.75, r * 2, r * 1.5);
      c.fillStyle = '#8a8a80';
      for (const x of [-r * 0.55, -r * 0.15]) {
        c.beginPath();
        c.arc(x, -r * 0.2, r * 0.2, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      c.strokeStyle = '#ffd60a';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(r * 0.55, -r * 0.55);
      c.lineTo(r * 0.25, 0);
      c.lineTo(r * 0.55, 0);
      c.lineTo(r * 0.25, r * 0.55);
      c.stroke();
      break;
    case 'generator':
      c.fillStyle = '#5a5a52';
      c.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
      c.strokeStyle = '#ffd60a';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(r * 0.2, -r * 0.6);
      c.lineTo(-r * 0.25, 0);
      c.lineTo(r * 0.2, 0);
      c.lineTo(-r * 0.2, r * 0.6);
      c.stroke();
      break;
    case 'aidPost':
      c.fillStyle = '#efeadf';
      c.fillRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.fillStyle = '#c1121f';
      c.fillRect(-r * 0.15, -r * 0.5, r * 0.3, r);
      c.fillRect(-r * 0.5, -r * 0.15, r, r * 0.3);
      break;
    case 'pump':
      c.fillRect(-r, -r, r * 2, r * 2);
      c.strokeRect(-r, -r, r * 2, r * 2);
      c.beginPath();
      c.arc(0, 0, r * 0.5, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(-r * 0.5, 0);
      c.lineTo(r * 0.5, 0);
      c.stroke();
      break;
    case 'launchSite':
      c.fillRect(-r, -r * 0.6, r * 2, r * 1.2);
      c.strokeRect(-r, -r * 0.6, r * 2, r * 1.2);
      c.beginPath();
      c.moveTo(-r * 0.7, r * 0.3);
      c.lineTo(r * 0.7, -r * 0.3);
      c.stroke();
      c.beginPath();
      c.moveTo(r * 0.3, -r * 0.3);
      c.lineTo(r * 0.7, -r * 0.3);
      c.lineTo(r * 0.7, r * 0.05);
      c.stroke();
      break;
    case 'net': {
      const nr = s.def.netR!;
      c.save();
      c.beginPath();
      c.arc(0, 0, nr, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = 'rgba(230,226,205,0.10)';
      c.fillRect(-nr, -nr, nr * 2, nr * 2);
      c.strokeStyle = 'rgba(230,226,205,0.35)';
      c.lineWidth = 1;
      for (let k = -nr; k <= nr; k += 12) {
        c.beginPath();
        c.moveTo(k, -nr);
        c.lineTo(k, nr);
        c.stroke();
        c.beginPath();
        c.moveTo(-nr, k);
        c.lineTo(nr, k);
        c.stroke();
      }
      c.restore();
      c.setLineDash(s.build < 1 ? [6, 5] : [3, 5]);
      c.strokeStyle = 'rgba(230,226,205,0.7)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(0, 0, nr, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = team.dark;
      c.strokeStyle = team.color;
      c.lineWidth = 2;
      c.fillRect(-r, -r, r * 2, r * 2);
      c.strokeRect(-r, -r, r * 2, r * 2);
      break;
    }
  }
  c.setLineDash([]);
  c.fillStyle = 'rgba(232,228,212,0.92)';
  c.font = '11px Barlow, sans-serif';
  c.textAlign = 'center';
  if (!s.def.trench && !s.def.pylon) c.fillText(s.def.label, 0, r + 14);
  if (s.build < 1) {
    c.fillStyle = '#000';
    c.fillRect(-r, -r - 10, r * 2, 5);
    c.fillStyle = team.stroke;
    c.fillRect(-r, -r - 10, r * 2 * s.build, 5);
  } else if (s.hp < s.def.hp) hpBar(c, -r, -r - 10, r * 2, s.hp / s.def.hp);
  c.restore();
}

export function drawDepot(c: CanvasRenderingContext2D, d: Site) {
  c.save();
  c.translate(d.x, d.y);
  c.fillStyle =
    d.owner === UA ? 'rgba(58,134,255,0.18)' : d.owner === RU ? 'rgba(193,18,31,0.18)' : 'rgba(200,200,180,0.12)';
  c.beginPath();
  c.arc(0, 0, d.r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = d.owner === UA ? TEAMS[UA].color : d.owner === RU ? TEAMS[RU].color : '#b8b4a0';
  c.lineWidth = 2;
  c.setLineDash([8, 6]);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = '#6a6455';
  c.fillRect(-14, -9, 12, 18);
  c.fillRect(2, -9, 12, 18);
  c.strokeStyle = '#3a3730';
  c.lineWidth = 1;
  c.strokeRect(-14, -9, 12, 18);
  c.strokeRect(2, -9, 12, 18);
  if (d.cap > 0 && d.capTeam >= 0) {
    c.strokeStyle = TEAMS[d.capTeam].color;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, d.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (d.cap / 5));
    c.stroke();
  }
  c.fillStyle = 'rgba(232,228,212,0.9)';
  c.font = '11px Barlow, sans-serif';
  c.textAlign = 'center';
  c.fillText(d.name, 0, d.r + 15);
  c.restore();
}

export function drawResource(c: CanvasRenderingContext2D, rs: Site, fx: Effect[]) {
  c.save();
  c.translate(rs.x, rs.y);
  const col = rs.owner === UA ? TEAMS[UA].color : rs.owner === RU ? TEAMS[RU].color : '#b8b4a0';
  if (rs.kind === 'wheat') {
    c.fillStyle = rs.burnT > 0 ? 'rgba(120,60,20,0.55)' : 'rgba(214,176,74,0.45)';
    c.beginPath();
    c.arc(0, 0, rs.r, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.clip();
    c.strokeStyle = rs.burnT > 0 ? 'rgba(60,30,10,0.5)' : 'rgba(150,115,40,0.55)';
    c.lineWidth = 1;
    for (let k = -rs.r; k <= rs.r; k += 8) {
      c.beginPath();
      c.moveTo(-rs.r, k);
      c.lineTo(rs.r, k);
      c.stroke();
    }
    c.restore();
    if (rs.burnT > 0 && Math.random() < 0.3)
      fx.push({
        kind: 'caught',
        x: rs.x + (Math.random() * 2 - 1) * rs.r * 0.7,
        y: rs.y + (Math.random() * 2 - 1) * rs.r * 0.7,
        t: 0,
        dur: 0.9,
      });
  } else {
    c.fillStyle = 'rgba(90,84,70,0.5)';
    c.beginPath();
    c.arc(0, 0, rs.r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#2a2621';
    c.fillStyle = '#6b6555';
    c.lineWidth = 2;
    if (rs.name.includes('depot')) {
      for (const dx of [-14, 14]) {
        c.beginPath();
        c.arc(dx, 0, 11, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    } else {
      c.beginPath();
      c.moveTo(-10, 14);
      c.lineTo(-3, -14);
      c.lineTo(3, -14);
      c.lineTo(10, 14);
      c.closePath();
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(-14, -8);
      c.lineTo(14, -12);
      c.stroke();
    }
  }
  c.strokeStyle = col;
  c.lineWidth = 2;
  c.setLineDash([8, 6]);
  c.beginPath();
  c.arc(0, 0, rs.r, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  if (rs.cap > 0 && rs.capTeam >= 0) {
    c.strokeStyle = TEAMS[rs.capTeam].color;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, rs.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (rs.cap / 5));
    c.stroke();
  }
  c.fillStyle = 'rgba(232,228,212,0.9)';
  c.font = '11px Barlow, sans-serif';
  c.textAlign = 'center';
  c.fillText(rs.name + (rs.burnT > 0 ? ' (burning)' : ''), 0, rs.r + 15);
  c.restore();
}
