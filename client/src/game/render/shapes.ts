// Unit silhouettes and small drawing primitives. A new unit picks a `shape` from the cases in shapePath.
import { clamp } from '../dmath';

/** every silhouette shapePath knows how to draw; a unit's `shape` must be one of these */
export const SHAPES = [
  'circle',
  'ring',
  'gun',
  'band',
  'dprk',
  'merc',
  'tri',
  'tritail',
  'diamond',
  'hex',
  'rect',
  'rrect',
  'cross',
  'pent',
  'wedge',
  'dart',
  'star',
  'moto',
  'truck',
  'plane',
  'car',
  'ugv',
  'relay',
  // multirotor drones: rotor discs on an X frame (the unit faces +x)
  'quad',
  'quadtail',
  'quadnose',
  'mavic',
  'hexa',
];

/** rotor centres of a multirotor: four on the diagonals, or six around the body */
function rotors(shape: string, r: number): [number, number][] {
  if (shape === 'hexa') {
    const out: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      out.push([Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95]);
    }
    return out;
  }
  const dx = shape === 'mavic' ? 0.62 : 0.72,
    dy = shape === 'mavic' ? 0.72 : 0.72;
  return [
    [r * dx, -r * dy],
    [r * dx, r * dy],
    [-r * dx, r * dy],
    [-r * dx, -r * dy],
  ];
}

/** a multirotor silhouette: the body, plus a disc for every rotor */
function multirotorPath(c: CanvasRenderingContext2D, shape: string, r: number) {
  const rr = shape === 'hexa' ? r * 0.34 : shape === 'mavic' ? r * 0.34 : r * 0.42;
  if (shape === 'mavic') c.roundRect(-r * 0.95, -r * 0.3, r * 1.9, r * 0.6, 3);
  else if (shape === 'hexa') c.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  else c.roundRect(-r * 0.5, -r * 0.32, r, r * 0.64, 2);
  if (shape === 'quadnose') {
    c.moveTo(r * 0.45, -r * 0.22);
    c.lineTo(r * 1.35, 0);
    c.lineTo(r * 0.45, r * 0.22);
    c.closePath();
  }
  for (const [x, y] of rotors(shape, r)) {
    c.moveTo(x + rr, y);
    c.arc(x, y, rr, 0, Math.PI * 2);
  }
}

export function shapePath(c: CanvasRenderingContext2D, shape: string, r: number) {
  c.beginPath();
  switch (shape) {
    case 'circle':
    case 'ring':
    case 'gun':
    case 'band':
    case 'dprk':
    case 'merc':
      c.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 'tri':
    case 'tritail':
      c.moveTo(r * 1.1, 0);
      c.lineTo(-r * 0.9, r * 0.75);
      c.lineTo(-r * 0.5, 0);
      c.lineTo(-r * 0.9, -r * 0.75);
      c.closePath();
      break;
    case 'diamond':
      c.moveTo(r * 1.1, 0);
      c.lineTo(0, r * 0.65);
      c.lineTo(-r * 1.1, 0);
      c.lineTo(0, -r * 0.65);
      c.closePath();
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.moveTo(r, 0);
      }
      c.closePath();
      break;
    case 'rect':
      c.rect(-r, -r * 0.62, r * 2, r * 1.24);
      break;
    case 'rrect':
      c.roundRect(-r, -r * 0.6, r * 2, r * 1.2, 4);
      break;
    case 'cross':
      c.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
      break;
    case 'pent':
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.moveTo(r, 0);
      }
      c.closePath();
      break;
    case 'wedge':
      c.moveTo(-r, -r * 0.7);
      c.lineTo(r * 0.7, -r * 0.45);
      c.lineTo(r * 0.7, r * 0.45);
      c.lineTo(-r, r * 0.7);
      c.closePath();
      break;
    case 'dart':
      c.moveTo(r * 1.4, 0);
      c.lineTo(-r * 0.5, r * 0.55);
      c.lineTo(-r * 0.95, 0);
      c.lineTo(-r * 0.5, -r * 0.55);
      c.closePath();
      break;
    case 'star':
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4,
          rr = i % 2 === 0 ? r * 1.2 : r * 0.45;
        if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else c.moveTo(rr, 0);
      }
      c.closePath();
      break;
    case 'moto':
      c.roundRect(-r * 1.1, -r * 0.45, r * 2.2, r * 0.9, 4);
      break;
    case 'truck':
      c.rect(-r, -r * 0.55, r * 2, r * 1.1);
      break;
    case 'plane':
      c.moveTo(r * 1.3, 0);
      c.lineTo(r * 0.3, r * 0.25);
      c.lineTo(-r * 0.1, r * 1.1);
      c.lineTo(-r * 0.45, r * 1.1);
      c.lineTo(-r * 0.35, r * 0.25);
      c.lineTo(-r * 1.1, r * 0.2);
      c.lineTo(-r * 1.3, r * 0.55);
      c.lineTo(-r * 1.4, 0);
      c.lineTo(-r * 1.3, -r * 0.55);
      c.lineTo(-r * 1.1, -r * 0.2);
      c.lineTo(-r * 0.35, -r * 0.25);
      c.lineTo(-r * 0.45, -r * 1.1);
      c.lineTo(-r * 0.1, -r * 1.1);
      c.lineTo(r * 0.3, -r * 0.25);
      c.closePath();
      break;
    case 'car':
      c.roundRect(-r, -r * 0.5, r * 2, r, 3);
      break;
    case 'ugv':
      c.roundRect(-r * 1.1, -r * 0.7, r * 2.2, r * 1.4, 2);
      break;
    case 'relay':
      c.rect(-r, -r * 0.6, r * 2, r * 1.2);
      break;
    case 'quad':
    case 'quadtail':
    case 'quadnose':
    case 'mavic':
    case 'hexa':
      multirotorPath(c, shape, r);
      break;
    default:
      c.arc(0, 0, r, 0, Math.PI * 2);
  }
}

export function shapeDetail(c: CanvasRenderingContext2D, shape: string, r: number, stroke: string, cargo?: string) {
  c.strokeStyle = stroke;
  c.fillStyle = stroke;
  c.lineWidth = 2;
  c.lineCap = 'round';
  switch (shape) {
    case 'rect':
      c.beginPath();
      c.arc(0, 0, r * 0.36, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(r * 0.3, 0);
      c.lineTo(r * 1.45, 0);
      c.stroke();
      break;
    case 'rrect':
      c.beginPath();
      c.arc(-r * 0.1, 0, r * 0.25, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(r * 1.2, 0);
      c.stroke();
      break;
    case 'cross':
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-r * 0.7, -r * 0.7);
      c.lineTo(r * 0.7, r * 0.7);
      c.moveTo(-r * 0.7, r * 0.7);
      c.lineTo(r * 0.7, -r * 0.7);
      c.stroke();
      c.beginPath();
      c.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      c.fill();
      break;
    case 'ring':
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -r * 1.5);
      c.stroke();
      break;
    case 'pent':
      c.beginPath();
      c.moveTo(r * 0.2, 0);
      c.lineTo(r * 1.7, 0);
      c.stroke();
      break;
    case 'wedge':
      c.lineWidth = 1.5;
      for (const y of [-r * 0.32, 0, r * 0.32]) {
        c.beginPath();
        c.moveTo(-r * 0.6, y);
        c.lineTo(r * 0.55, y);
        c.stroke();
      }
      break;
    case 'circle':
    case 'band':
    case 'star':
      c.beginPath();
      c.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      c.fill();
      break;
    case 'hex':
      c.beginPath();
      c.arc(0, 0, r * 0.35, 0, Math.PI * 2);
      c.stroke();
      break;
    case 'tri':
      c.beginPath();
      c.moveTo(-r * 0.5, 0);
      c.lineTo(r * 0.5, 0);
      c.stroke();
      break;
    case 'dart':
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-r * 0.6, -r * 0.55);
      c.lineTo(-r * 0.6, r * 0.55);
      c.stroke();
      break;
    case 'dprk':
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5,
          rr = i % 2 === 0 ? r * 0.62 : r * 0.26;
        if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      break;
    case 'merc':
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(-r * 0.3, 0);
      c.lineTo(r * 0.3, 0);
      c.stroke();
      break;
    case 'plane':
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-r * 0.4, 0);
      c.lineTo(r * 0.9, 0);
      c.stroke();
      break;
    case 'car':
      c.fillRect(r * 0.1, -r * 0.35, r * 0.5, r * 0.7);
      break;
    case 'tritail':
      c.beginPath();
      c.moveTo(-r * 0.5, 0);
      c.lineTo(r * 0.5, 0);
      c.stroke();
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-r * 0.7, 0);
      c.lineTo(-r * 1.6, r * 0.4);
      c.lineTo(-r * 2.4, -r * 0.3);
      c.lineTo(-r * 3.2, r * 0.2);
      c.stroke();
      break;
    case 'gun':
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(r * 1.9, -r * 0.5);
      c.stroke();
      c.beginPath();
      c.arc(-r * 0.35, r * 0.4, r * 0.22, 0, Math.PI * 2);
      c.arc(-r * 0.35, -r * 0.4, r * 0.22, 0, Math.PI * 2);
      c.fill();
      break;
    case 'moto':
      c.beginPath();
      c.arc(-r * 0.7, 0, r * 0.32, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(r * 0.7, 0, r * 0.32, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(-r * 0.05, -r * 0.1, r * 0.25, 0, Math.PI * 2);
      c.fill();
      break;
    case 'ugv':
      c.lineWidth = 2;
      for (const y of [-r * 0.7, r * 0.7]) {
        c.beginPath();
        c.moveTo(-r * 1.1, y);
        c.lineTo(r * 1.1, y);
        c.stroke();
      }
      c.beginPath();
      c.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(r * 1.4, 0);
      c.stroke();
      break;
    case 'relay':
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -r * 1.6);
      c.stroke();
      c.beginPath();
      c.arc(0, -r * 1.6, r * 0.45, Math.PI * 0.15, Math.PI * 0.85, true);
      c.stroke();
      c.beginPath();
      c.arc(-r * 0.5, r * 0.6, r * 0.2, 0, Math.PI * 2);
      c.arc(r * 0.5, r * 0.6, r * 0.2, 0, Math.PI * 2);
      c.fill();
      break;
    case 'quad':
    case 'quadtail':
    case 'quadnose':
    case 'mavic':
    case 'hexa': {
      // the arms from the body to each rotor, a hub on every rotor, and the camera or warhead at the nose
      c.lineWidth = shape === 'hexa' ? 2 : 1.5;
      for (const [x, y] of rotors(shape, r)) {
        c.beginPath();
        c.moveTo(x * 0.3, y * 0.3);
        c.lineTo(x, y);
        c.stroke();
        c.beginPath();
        c.arc(x, y, r * 0.1, 0, Math.PI * 2);
        c.fill();
      }
      if (shape === 'mavic') {
        c.beginPath();
        c.arc(r * 0.72, 0, r * 0.16, 0, Math.PI * 2);
        c.stroke();
      } else if (shape !== 'quadnose') {
        c.beginPath();
        c.arc(shape === 'hexa' ? 0 : r * 0.28, 0, r * 0.13, 0, Math.PI * 2);
        c.fill();
      }
      if (shape === 'quadtail') {
        // the fiber-optic spool paying out behind
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(-r * 0.7, 0);
        c.lineTo(-r * 1.6, r * 0.4);
        c.lineTo(-r * 2.4, -r * 0.3);
        c.lineTo(-r * 3.2, r * 0.2);
        c.stroke();
      }
      break;
    }
    case 'truck':
      c.fillRect(r * 0.45, -r * 0.45, r * 0.55, r * 0.9);
      if (cargo === 'oil') {
        c.beginPath();
        c.arc(-r * 0.25, 0, r * 0.38, 0, Math.PI * 2);
        c.stroke();
      } else if (cargo === 'grain') {
        c.fillStyle = '#d6b04a';
        c.fillRect(-r * 0.85, -r * 0.35, r * 1.1, r * 0.7);
        c.fillStyle = stroke;
      }
      c.beginPath();
      c.arc(-r * 0.55, r * 0.6, r * 0.2, 0, Math.PI * 2);
      c.arc(r * 0.35, r * 0.6, r * 0.2, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(-r * 0.55, -r * 0.6, r * 0.2, 0, Math.PI * 2);
      c.arc(r * 0.35, -r * 0.6, r * 0.2, 0, Math.PI * 2);
      c.fill();
      break;
  }
}

export function hpBar(c: CanvasRenderingContext2D, x: number, y: number, w: number, ratio: number) {
  c.fillStyle = '#000';
  c.fillRect(x, y, w, 4);
  c.fillStyle = ratio > 0.5 ? '#8bc34a' : ratio > 0.25 ? '#e0a030' : '#e04040';
  c.fillRect(x, y, w * clamp(ratio, 0, 1), 4);
}
