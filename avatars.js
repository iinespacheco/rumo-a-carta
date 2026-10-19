/* Rumo à Carta — avatares (desenhos próprios, em SVG)
   Cada avatar é um círculo pastel com um bichinho/objeto de contorno azul-escuro. */
(() => {
  'use strict';

  const INK = '#2b3a55';
  const BLUSH = '#f2a9a0';
  const S = `stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`;

  const circle = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${S} ${extra}/>`;
  const dot = (cx, cy, r, fill = INK) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
  const path = (d, fill = 'none', extra = '') => `<path d="${d}" fill="${fill}" ${S} ${extra}/>`;
  const f1 = (n) => Math.round(n * 10) / 10;

  // olhos, sorriso e bochechas
  function face(cx, cy, spread, k = 1) {
    const sm = 3 * k;
    return dot(cx - spread, cy, 2.1 * k) + dot(cx + spread, cy, 2.1 * k) +
      `<path d="M${f1(cx - sm)} ${f1(cy + 4.4 * k)} q${f1(sm)} ${f1(3.4 * k)} ${f1(2 * sm)} 0" fill="none" stroke="${INK}" stroke-width="${f1(2 * Math.max(k, .8))}" stroke-linecap="round"/>` +
      `<circle cx="${f1(cx - spread - 3.6 * k)}" cy="${f1(cy + 4 * k)}" r="${f1(2.6 * k)}" fill="${BLUSH}" opacity=".75"/>` +
      `<circle cx="${f1(cx + spread + 3.6 * k)}" cy="${f1(cy + 4 * k)}" r="${f1(2.6 * k)}" fill="${BLUSH}" opacity=".75"/>`;
  }

  const polar = (cx, cy, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];

  const LIST = [
    {
      key: 'gato', label: 'gato', bg: '#cfe2ef',
      art: () =>
        path('M14 30 L15.5 11 L29 21 Z', '#f4c9a0') + path('M50 30 L48.5 11 L35 21 Z', '#f4c9a0') +
        path('M18 25 L18.6 16.5 L24.5 21.5 Z', '#f2a9a0', 'stroke-width="0"') + path('M46 25 L45.4 16.5 L39.5 21.5 Z', '#f2a9a0', 'stroke-width="0"') +
        `<ellipse cx="32" cy="37" rx="19" ry="16" fill="#f4c9a0" ${S}/>` +
        face(32, 35, 8) + path('M30 37.6 h4 l-2 2.4 z', '#c8453f', 'stroke-width="1.6"') +
        path('M10 36 L18 38 M10 43 L18 41.5 M54 36 L46 38 M54 43 L46 41.5', 'none', 'stroke-width="1.8"')
    },
    {
      key: 'coelho', label: 'coelho', bg: '#f9d9d3',
      art: () =>
        `<ellipse cx="23.5" cy="18" rx="6" ry="12" transform="rotate(-8 23.5 18)" fill="#fffaf0" ${S}/>` +
        `<ellipse cx="40.5" cy="18" rx="6" ry="12" transform="rotate(8 40.5 18)" fill="#fffaf0" ${S}/>` +
        `<ellipse cx="23.5" cy="19" rx="2.6" ry="7.5" transform="rotate(-8 23.5 19)" fill="#f2a9a0"/>` +
        `<ellipse cx="40.5" cy="19" rx="2.6" ry="7.5" transform="rotate(8 40.5 19)" fill="#f2a9a0"/>` +
        `<ellipse cx="32" cy="41" rx="17" ry="14.5" fill="#fffaf0" ${S}/>` +
        face(32, 39.5, 7) + path('M30.4 42.2 h3.2 l-1.6 2 z', '#e48b86', 'stroke-width="1.4"')
    },
    {
      key: 'urso', label: 'urso', bg: '#f6e6b8',
      art: () =>
        circle(17, 20, 7.5, '#d8b08c') + circle(47, 20, 7.5, '#d8b08c') +
        dot(17, 20, 3.4, '#efd2b4') + dot(47, 20, 3.4, '#efd2b4') +
        circle(32, 37, 18.5, '#d8b08c') +
        `<ellipse cx="32" cy="43" rx="8.5" ry="6.4" fill="#f3dfc6" ${S} stroke-width="1.8"/>` +
        dot(24.5, 33, 2.1) + dot(39.5, 33, 2.1) +
        `<ellipse cx="32" cy="40.2" rx="2.8" ry="2.1" fill="${INK}"/>` +
        path('M32 42 v2 M28.6 45 q3.4 2.6 6.8 0', 'none', 'stroke-width="1.9"') +
        `<circle cx="21.5" cy="39" r="2.6" fill="${BLUSH}" opacity=".7"/><circle cx="42.5" cy="39" r="2.6" fill="${BLUSH}" opacity=".7"/>`
    },
    {
      key: 'sapo', label: 'sapo', bg: '#e3efd6',
      art: () =>
        circle(21, 23, 8.5, '#b9d3a5') + circle(43, 23, 8.5, '#b9d3a5') +
        `<ellipse cx="32" cy="39" rx="22" ry="15.5" fill="#b9d3a5" ${S}/>` +
        circle(21, 23, 5.6, '#fffaf0') + circle(43, 23, 5.6, '#fffaf0') + dot(21.6, 23.4, 2.5) + dot(42.4, 23.4, 2.5) +
        path('M20 40 q12 9.5 24 0', 'none') + dot(29.5, 34, 1.1) + dot(34.5, 34, 1.1) +
        `<circle cx="16" cy="39" r="3" fill="${BLUSH}" opacity=".75"/><circle cx="48" cy="39" r="3" fill="${BLUSH}" opacity=".75"/>`
    },
    {
      key: 'flor', label: 'flor', bg: '#cfe2ef',
      art: () => {
        let petals = '';
        for (let k = 0; k < 8; k++) { const [x, y] = polar(32, 32, 14.5, k * 45 - 90); petals += circle(f1(x), f1(y), 7.4, k % 2 ? '#f9d9d3' : '#f2b8b0'); }
        return petals + circle(32, 32, 10.5, '#f6d46a') + face(32, 31.5, 4.2, .8);
      }
    },
    {
      key: 'cereja', label: 'cereja', bg: '#f6e6b8',
      art: () =>
        path('M23 36 Q25 20 39 12', 'none') + path('M43 38 Q43 22 39 12', 'none') +
        path('M39 12 q9 -6 15 3 q-9 5 -15 -3 z', '#b9d3a5') +
        circle(22, 46, 11, '#c8453f') + circle(43, 47, 11, '#c8453f') +
        `<path d="M16.5 42 q1.5 -3 4.5 -3.6" fill="none" stroke="#fffaf0" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>` +
        `<path d="M37.5 43 q1.5 -3 4.5 -3.6" fill="none" stroke="#fffaf0" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>` +
        face(22, 47, 4, .75).replace(/#f2a9a0/g, '#f6c9c0') + face(43, 48, 4, .75).replace(/#f2a9a0/g, '#f6c9c0')
    },
    {
      key: 'estrela', label: 'estrela', bg: '#cfe2ef',
      art: () => {
        const pts = [];
        for (let k = 0; k < 10; k++) { const [x, y] = polar(32, 34, k % 2 ? 12.5 : 26, k * 36 - 90); pts.push(f1(x) + ' ' + f1(y)); }
        return path('M' + pts.join(' L') + ' Z', '#f6d46a', 'stroke-width="2.6"') + face(32, 36, 6.2);
      }
    },
    {
      key: 'nuvem', label: 'nuvem', bg: '#f9d9d3',
      art: () => {
        const shapes = (fill, extra) =>
          `<g fill="${fill}" ${extra}><circle cx="19" cy="39" r="8"/><circle cx="29" cy="31" r="10"/><circle cx="41" cy="32" r="9"/><circle cx="47" cy="40" r="7"/><rect x="19" y="38" width="28" height="9"/></g>`;
        return shapes(INK, `stroke="${INK}" stroke-width="4.8" stroke-linejoin="round"`) + shapes('#eef6fb', '') + face(33, 38.5, 6.5);
      }
    },
    {
      key: 'sol', label: 'sol', bg: '#cfe2ef',
      art: () => {
        let rays = '';
        for (let k = 0; k < 8; k++) { const [x1, y1] = polar(32, 32, 20.5, k * 45); const [x2, y2] = polar(32, 32, 26.5, k * 45); rays += `<path d="M${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)}" fill="none" ${S} stroke-width="3.2"/>`; }
        return rays + circle(32, 32, 15.5, '#f6d46a') + face(32, 31, 6);
      }
    },
    {
      key: 'cogumelo', label: 'cogumelo', bg: '#f6e6b8',
      art: () =>
        path('M24 38 H40 V49 Q40 55 32 55 Q24 55 24 49 Z', '#fff4de') +
        path('M9 39 Q9 11 32 11 Q55 11 55 39 Z', '#c8453f') +
        dot(22, 27, 3.8, '#fffaf0') + dot(37, 21.5, 3.4, '#fffaf0') + dot(45, 32, 3, '#fffaf0') + dot(15, 33.5, 2.6, '#fffaf0') +
        face(32, 46, 4.2, .8)
    },
    {
      key: 'carro', label: 'carro', bg: '#f9d9d3',
      art: () =>
        path('M17 33 L23 20.5 Q24 18.5 27 18.5 H39 Q42 18.5 43 20.5 L49 33 Z', '#9fc3dc') +
        path('M22.5 31.5 L26.6 22 H31 V31.5 Z', '#eef6fb', 'stroke-width="1.8"') + path('M34 31.5 V22 H38.6 L42.6 31.5 Z', '#eef6fb', 'stroke-width="1.8"') +
        `<rect x="7" y="31" width="50" height="16" rx="7" fill="#9fc3dc" ${S}/>` +
        `<rect x="49" y="35" width="6" height="4.5" rx="2" fill="#f6d46a" stroke="${INK}" stroke-width="1.6"/>` +
        `<path d="M12 40 H20" stroke="#fffaf0" stroke-width="2.2" stroke-linecap="round" fill="none"/>` +
        circle(19.5, 47.5, 6.2, INK) + circle(44.5, 47.5, 6.2, INK) + dot(19.5, 47.5, 2.4, '#fff4de') + dot(44.5, 47.5, 2.4, '#fff4de')
    },
    {
      key: 'fantasma', label: 'fantasma', bg: '#cfe2ef',
      art: () =>
        path('M15 51 V30 a17 17 0 0 1 34 0 V51 q-5.67 9 -11.33 0 q-5.67 9 -11.34 0 q-5.66 9 -11.33 0 Z', '#fffaf0') +
        face(32, 31, 6.4)
    }
  ];

  const BY_KEY = new Map(LIST.map((a) => [a.key, a]));

  function svg(key, size) {
    const a = BY_KEY.get(key) || LIST[0];
    const px = size ? ` width="${size}" height="${size}"` : '';
    return `<svg viewBox="0 0 64 64"${px} xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
      `<circle cx="32" cy="32" r="30.4" fill="${a.bg}" ${S} stroke-width="2.6"/>${a.art()}</svg>`;
  }

  window.RUMO_AVATARS = {
    list: LIST.map((a) => ({ key: a.key, label: a.label })),
    has: (k) => BY_KEY.has(k),
    keyAt: (i) => LIST[((i % LIST.length) + LIST.length) % LIST.length].key,
    svg
  };
})();
