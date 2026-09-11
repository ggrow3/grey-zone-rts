// The unit shape legend panel.
import { UA, RU, TEAMS, UNITS } from '../data';
import { shapePath, shapeDetail } from './shapes';

export function drawLegend(cv: HTMLCanvasElement) {
  const list = [
    'fpv',
    'fiberFpv',
    'mavic',
    'fwRecon',
    'interceptor',
    'bomber',
    'liutyi',
    'lancet',
    'molniya',
    'geran',
    'geran3',
    'geran5',
    'gerbera',
    'infantry',
    'fireGroup',
    'moto',
    'merc',
    'dprk',
    'defector',
    'truck',
    'civcar',
    'tank',
    'ifv',
    'aa',
    'jammer',
    'howitzer',
    'mlrs',
    'ugv',
    'relay',
  ];
  const cw = cv.clientWidth || 640,
    ch = cv.clientHeight || 150,
    d = window.devicePixelRatio || 1;
  cv.width = cw * d;
  cv.height = ch * d;
  const c = cv.getContext('2d')!;
  c.setTransform(d, 0, 0, d, 0, 0);
  c.clearRect(0, 0, cw, ch);
  const cols = cw > 420 ? 4 : 2,
    cellW = cw / cols,
    cellH = Math.max(22, ch / Math.ceil(list.length / cols));
  list.forEach((k, i) => {
    const def = UNITS[k],
      x = (i % cols) * cellW,
      y = Math.floor(i / cols) * cellH;
    c.save();
    c.translate(x + 18, y + cellH / 2);
    const enemy = def.side === 1,
      neutral = k === 'civcar';
    shapePath(c, def.shape, def.r);
    c.fillStyle = def.hollow ? 'rgba(90,20,24,0.5)' : neutral ? '#efeadf' : enemy ? TEAMS[RU].color : TEAMS[UA].color;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = neutral ? '#5d584c' : enemy ? TEAMS[RU].stroke : TEAMS[UA].stroke;
    c.stroke();
    shapeDetail(c, def.shape, def.r, neutral ? '#5d584c' : enemy ? TEAMS[RU].stroke : TEAMS[UA].stroke);
    if (k === 'defector') {
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, def.r * 0.62, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
    c.fillStyle = '#e8e4d4';
    c.font = '13px Barlow, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(
      (enemy ? def.label[RU] : def.label[UA]) + (enemy ? ' (Russia)' : neutral ? ' (neutral)' : ''),
      x + 42,
      y + cellH / 2
    );
  });
}
