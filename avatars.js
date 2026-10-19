/* Rumo à Carta — avatares (desenhos próprios, em SVG)
   Carinhas de bichos: contorno grosso mais escuro que a cor, cores lisas,
   olhinhos de ponto e bochechas rosadas, num círculo pastel. */
(() => {
  'use strict';

  const f1 = (n) => Math.round(n * 10) / 10;
  const SW = 3.2;   // espessura do contorno

  // desenho de uma forma com contorno
  const shape = (d, fill, line, sw = SW, extra = '') =>
    `<path d="${d}" fill="${fill}" stroke="${line}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
  const ell = (cx, cy, rx, ry, fill, line, sw = SW, extra = '') =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${line ? `stroke="${line}" stroke-width="${sw}"` : ''} ${extra}/>`;
  const dot = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
  const line = (d, color, sw = 2) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;

  // cabeça "mochi": larga, ligeiramente mais cheia em baixo
  function mochi(cx, cy, w, h) {
    const t = cy - h, b = cy + h, l = cx - w, r = cx + w;
    return `M${f1(l)} ${f1(cy)}C${f1(l)} ${f1(cy - h * .62)} ${f1(cx - w * .55)} ${f1(t)} ${f1(cx)} ${f1(t)}` +
      `C${f1(cx + w * .55)} ${f1(t)} ${f1(r)} ${f1(cy - h * .62)} ${f1(r)} ${f1(cy)}` +
      `C${f1(r)} ${f1(cy + h * .72)} ${f1(cx + w * .6)} ${f1(b)} ${f1(cx)} ${f1(b)}` +
      `C${f1(cx - w * .6)} ${f1(b)} ${f1(l)} ${f1(cy + h * .72)} ${f1(l)} ${f1(cy)}Z`;
  }

  const PINK = '#f5a7a8';
  const blush = (x, y, rx = 4.6, ry = 3.1) =>
    ell(x, y, rx, ry, PINK, '', 0, 'opacity=".34"') + ell(x, y, rx * .64, ry * .64, PINK, '', 0, 'opacity=".5"');
  const eyes = (cx, y, spread, color, r = 2.5) => dot(f1(cx - spread), y, r, color) + dot(f1(cx + spread), y, r, color);
  const smile = (cx, y, color, w = 2.8) => line(`M${f1(cx - w)} ${y}q${f1(w / 2)} 2.6 ${f1(w)} 0q${f1(w / 2)} 2.6 ${f1(w)} 0`, color, 1.9);

  const LIST = [
    {
      key: 'gato', label: 'gato', bg: '#dcebf5',
      art: () => {
        const L = '#9a5a35', F = '#f3b877';
        return shape('M13 31L13.5 12.5Q13.8 10.5 15.6 11.4L29 19.5', F, L) +
          shape('M51 31L50.5 12.5Q50.2 10.5 48.4 11.4L35 19.5', F, L) +
          shape('M16.5 25L17 16.5L24 20.4Z', '#f6b9b3', '', 0) + shape('M47.5 25L47 16.5L40 20.4Z', '#f6b9b3', '', 0) +
          shape(mochi(32, 38, 21, 16.5), F, L) +
          line('M32 22.5v4.2M26.8 23.6l.9 3.4M37.2 23.6l-.9 3.4', '#d98a4c', 2) +
          eyes(32, 37, 9, '#4a2e22') + blush(18.6, 42.5) + blush(45.4, 42.5) +
          shape('M30.1 40.3h3.8l-1.9 2.3Z', '#e07a78', '#e07a78', 1.4) +
          line('M32 42.7v1.6M28.6 45.1q3.4 2 6.8 0', '#4a2e22', 1.8);
      }
    },
    {
      key: 'coelho', label: 'coelho', bg: '#fbe3df',
      art: () => {
        const L = '#a96a7c', F = '#fff4ee';
        return shape('M21.5 31C18.5 18 19 8.5 23.4 8.2C28 8 29.5 20 28.6 31', F, L) +
          shape('M42.5 31C45.5 18 45 8.5 40.6 8.2C36 8 34.5 20 35.4 31', F, L) +
          shape('M23.4 27C21.6 19 21.6 13 23.6 12.8C25.4 12.8 26.4 19 26 27Z', '#f6bcb8', '', 0) +
          shape('M40.6 27C42.4 19 42.4 13 40.4 12.8C38.6 12.8 37.6 19 38 27Z', '#f6bcb8', '', 0) +
          shape(mochi(32, 40.5, 20.5, 15), F, L) +
          eyes(32, 40, 9.5, '#5a3a47') + blush(18.8, 45.5) + blush(45.2, 45.5) +
          shape('M30.4 43.2h3.2l-1.6 2Z', '#eb8f93', '#eb8f93', 1.4) +
          line('M32 45.2v1.4M29 47.2q3 1.9 6 0', '#5a3a47', 1.7);
      }
    },
    {
      key: 'urso', label: 'urso', bg: '#fdf0c9',
      art: () => {
        const L = '#6e4632', F = '#d4a77c';
        return ell(17, 20.5, 7.6, 7.2, F, L) + ell(47, 20.5, 7.6, 7.2, F, L) +
          ell(17, 21.4, 3.6, 3.3, '#efcfae', '', 0) + ell(47, 21.4, 3.6, 3.3, '#efcfae', '', 0) +
          shape(mochi(32, 37.5, 21, 17), F, L) +
          ell(32, 43.8, 8.6, 6.2, '#f6e3cb', '', 0) +
          eyes(32, 36.5, 10.5, '#43291d') + blush(17.8, 42.8) + blush(46.2, 42.8) +
          ell(32, 41, 3.1, 2.3, '#43291d', '', 0) +
          line('M32 43.2v2M28.8 46q3.2 2.2 6.4 0', '#43291d', 1.8);
      }
    },
    {
      key: 'sapo', label: 'sapo', bg: '#e3f0d8',
      art: () => {
        const L = '#4a7d3f', F = '#aedb92';
        return ell(21, 23, 8.8, 8.4, F, L) + ell(43, 23, 8.8, 8.4, F, L) +
          shape(mochi(32, 40, 23, 14.5), F, L) +
          ell(21, 23.2, 4.7, 4.8, '#ffffff', '', 0) + ell(43, 23.2, 4.7, 4.8, '#ffffff', '', 0) +
          dot(21.6, 23.6, 2.7, '#2f4a2a') + dot(42.4, 23.6, 2.7, '#2f4a2a') +
          blush(15.6, 43.6, 4.4, 3) + blush(48.4, 43.6, 4.4, 3) +
          line('M23 41.2q9 6.4 18 0', '#2f4a2a', 2) + dot(29.6, 36, 1.1, '#4a7d3f') + dot(34.4, 36, 1.1, '#4a7d3f');
      }
    },
    {
      key: 'pinguim', label: 'pinguim', bg: '#dcebf5',
      art: () => {
        const L = '#2f4170', F = '#6076a8';
        return shape(mochi(32, 36.5, 22.5, 19.5), F, L) +
          shape('M32 27.5C23.5 27.5 16 34 16 41.4C16 47.8 22.6 52.4 32 52.4C41.4 52.4 48 47.8 48 41.4C48 34 40.5 27.5 32 27.5Z', '#fffdf9', '', 0) +
          eyes(32, 36.5, 10.6, '#2b3a63') + blush(20.5, 42.8, 4.4, 3) + blush(43.5, 42.8, 4.4, 3) +
          shape('M27.3 39.6Q32 36.9 36.7 39.6Q35.4 44.7 32 44.7Q28.6 44.7 27.3 39.6Z', '#f4b840', '#d98a1f', 1.6);
      }
    },
    {
      key: 'lontra', label: 'lontra', bg: '#fdf0c9',
      art: () => {
        const L = '#6b4b40', F = '#bfa493';
        return ell(14.6, 22.4, 5.6, 5.4, F, L) + ell(49.4, 22.4, 5.6, 5.4, F, L) +
          ell(14.9, 23, 2.1, 2.1, '#f1e1d4', '', 0) + ell(49.1, 23, 2.1, 2.1, '#f1e1d4', '', 0) +
          shape(mochi(32, 37, 22.5, 16.5), F, L) +
          shape('M15.5 45C16 38.5 23 38 32 38C41 38 48 38.5 48.5 45C48.5 51 41 53.2 32 53.2C23 53.2 15.5 51 15.5 45Z', '#fbf1e6', '', 0) +
          eyes(32, 35, 10.2, '#4b332b') + blush(17.4, 41.5, 4.2, 2.9) + blush(46.6, 41.5, 4.2, 2.9) +
          shape('M28.6 39.6Q32 37.6 35.4 39.6Q34.4 43.4 32 43.4Q29.6 43.4 28.6 39.6Z', '#5b3f35', '#5b3f35', 1.2) +
          line('M32 43.2v1.9M27.4 46.3q2.3 2 4.6-.9q2.3 2.9 4.6.9', '#5b3f35', 1.7);
      }
    },
    {
      key: 'pintainho', label: 'pintainho', bg: '#fbe3df',
      art: () => {
        const L = '#b8732a', F = '#ffe27d';
        return line('M32 22.6Q31 15.6 26.8 13.6M32 22.6Q33.2 14.4 37.6 12.8M32 22.6Q36.4 19 41.6 19.2', L, 3.2) +
          line('M32 22.6Q31 15.6 26.8 13.6M32 22.6Q33.2 14.4 37.6 12.8M32 22.6Q36.4 19 41.6 19.2', F, 1.1) +
          shape(mochi(32, 38.5, 22, 17.5), F, L) +
          eyes(32, 37.5, 10.4, '#5a3716') + blush(18.4, 43.5) + blush(45.6, 43.5) +
          shape('M27.6 40.6Q32 38.3 36.4 40.6Q35.6 45.4 32 45.4Q28.4 45.4 27.6 40.6Z', '#ff9f43', '#d97b1e', 1.6);
      }
    },
    {
      key: 'panda', label: 'panda', bg: '#e3f0d8',
      art: () => {
        const L = '#3d3d4f', F = '#ffffff';
        return ell(16.4, 21, 7.6, 7.4, '#4a4a5c', L) + ell(47.6, 21, 7.6, 7.4, '#4a4a5c', L) +
          shape(mochi(32, 38, 21.5, 17.5), F, L) +
          `<ellipse cx="22.2" cy="37" rx="5.6" ry="7" transform="rotate(18 22.2 37)" fill="#4a4a5c"/>` +
          `<ellipse cx="41.8" cy="37" rx="5.6" ry="7" transform="rotate(-18 41.8 37)" fill="#4a4a5c"/>` +
          dot(22.8, 36.6, 2.4, '#ffffff') + dot(41.2, 36.6, 2.4, '#ffffff') + dot(22.8, 36.6, 1.2, '#2e2e3b') + dot(41.2, 36.6, 1.2, '#2e2e3b') +
          blush(15.6, 46.6, 4, 2.7) + blush(48.4, 46.6, 4, 2.7) +
          ell(32, 43.4, 3.1, 2.3, '#3a3a4a', '', 0) + line('M32 45.5v1.7M28.8 48.3q3.2 2.2 6.4 0', '#3a3a4a', 1.8);
      }
    },
    {
      key: 'raposa', label: 'raposa', bg: '#dcebf5',
      art: () => {
        const L = '#9c4f27', F = '#f4a25c';
        return shape('M12.5 33L13.6 11.6Q13.8 10.2 15.2 10.9L30 21', F, L) +
          shape('M51.5 33L50.4 11.6Q50.2 10.2 48.8 10.9L34 21', F, L) +
          shape('M14.4 20.6L14.8 14L20.4 17.6Z', '#6b3a22', '', 0) + shape('M49.6 20.6L49.2 14L43.6 17.6Z', '#6b3a22', '', 0) +
          shape(mochi(32, 38.5, 22, 15.5), F, L) +
          shape('M11 41C16 37.5 23.5 40.5 32 49.6C40.5 40.5 48 37.5 53 41C52 48.5 43.5 53.4 32 53.4C20.5 53.4 12 48.5 11 41Z', '#fff7ee', '', 0) +
          eyes(32, 36.2, 10.4, '#4a2814') + blush(17.6, 42.6, 4.2, 2.8) + blush(46.4, 42.6, 4.2, 2.8) +
          ell(32, 44.6, 3, 2.2, '#4a2814', '', 0) + line('M32 46.6v1.4M29 49q3 2 6 0', '#4a2814', 1.7);
      }
    },
    {
      key: 'porquinho', label: 'porquinho', bg: '#fdf0c9',
      art: () => {
        const L = '#b05a74', F = '#fbc3cd';
        return shape('M14 29L12.4 15Q12.4 13.4 14 13.6L27.6 19', F, L) +
          shape('M50 29L51.6 15Q51.6 13.4 50 13.6L36.4 19', F, L) +
          shape(mochi(32, 38, 22, 17.5), F, L) +
          eyes(32, 35, 11.4, '#5a2f3e') + blush(16.4, 42, 4.2, 2.9) + blush(47.6, 42, 4.2, 2.9) +
          ell(32, 43.8, 8.2, 6, '#f594a9', '#b05a74', 2.4) +
          ell(29, 43.8, 1.5, 2.2, '#8a3f56', '', 0) + ell(35, 43.8, 1.5, 2.2, '#8a3f56', '', 0);
      }
    },
    {
      key: 'ovelha', label: 'ovelha', bg: '#e8e1f3',
      art: () => {
        const L = '#7d6b93';
        const wool = [[17, 25, 8.6], [27, 17.4, 8.6], [38.6, 17.4, 8.6], [47.6, 25, 8.4], [50, 36, 8.2], [14, 36, 8.2]];
        const puffs = (fill, stroke) => wool.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${stroke ? `stroke="${L}" stroke-width="${SW}"` : ''}/>`).join('');
        return ell(10.2, 40.6, 5.4, 3.4, '#cdb7a8', L, 2.6, 'transform="rotate(-22 10.2 40.6)"') + ell(53.8, 40.6, 5.4, 3.4, '#cdb7a8', L, 2.6, 'transform="rotate(22 53.8 40.6)"') +
          puffs('#fffdfb', true) + puffs('#fffdfb', false) +
          shape(mochi(32, 41, 15.6, 14), '#f8dcc4', L) +
          eyes(32, 40.4, 6.6, '#4e3d5d') + blush(21.6, 45.6, 3.4, 2.4) + blush(42.4, 45.6, 3.4, 2.4) +
          ell(32, 44, 2.2, 1.7, '#d98c88', '', 0) + line('M29.2 47q2.8 2 5.6 0', '#4e3d5d', 1.6);
      }
    },
    {
      key: 'cao', label: 'cão', bg: '#fbe3df',
      art: () => {
        const L = '#7a5236', F = '#ecd0a8';
        return shape('M13.5 26C8 28 7 40 10.4 47C13 50 17.6 48 18.6 43L19.4 28Z', '#b98255', L) +
          shape('M50.5 26C56 28 57 40 53.6 47C51 50 46.4 48 45.4 43L44.6 28Z', '#b98255', L) +
          shape(mochi(32, 36.5, 20.5, 17.5), F, L) +
          `<ellipse cx="22.4" cy="33.6" rx="5.8" ry="6.6" transform="rotate(14 22.4 33.6)" fill="#c9965f"/>` +
          eyes(32, 35.4, 9.6, '#46301f') + blush(19.4, 42.4, 4, 2.8) + blush(44.6, 42.4, 4, 2.8) +
          ell(32, 40.8, 6.8, 5.2, '#fbeed8', '', 0) +
          shape('M29.2 39.2Q32 37.2 34.8 39.2Q34 42.2 32 42.2Q30 42.2 29.2 39.2Z', '#46301f', '#46301f', 1.2) +
          line('M32 42.2v1.6M28.6 45.1q3.4 2.2 6.8 0', '#46301f', 1.7) +
          shape('M30.4 45.9Q32 50 33.6 45.9Z', '#f28c93', '#c25a65', 1.2);
      }
    }
  ];

  // nomes antigos (os 12 desenhos da fase 3): continuam a mostrar um bichinho
  const LEGACY = { flor: 'raposa', cereja: 'pintainho', estrela: 'panda', nuvem: 'ovelha', sol: 'pinguim', cogumelo: 'porquinho', carro: 'cao', fantasma: 'lontra' };

  const BY_KEY = new Map(LIST.map((a) => [a.key, a]));
  const resolve = (k) => BY_KEY.get(k) || BY_KEY.get(LEGACY[k]) || null;

  function svg(key, size) {
    const a = resolve(key) || LIST[0];
    const px = size ? ` width="${size}" height="${size}"` : '';
    return `<svg viewBox="0 0 64 64"${px} xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
      `<circle cx="32" cy="32" r="31" fill="${a.bg}"/><g transform="translate(32 33.5) scale(.74) translate(-32 -33)">${a.art()}</g></svg>`;
  }

  window.RUMO_AVATARS = {
    list: LIST.map((a) => ({ key: a.key, label: a.label })),
    has: (k) => !!resolve(k),
    keyAt: (i) => LIST[((i % LIST.length) + LIST.length) % LIST.length].key,
    svg
  };
})();
