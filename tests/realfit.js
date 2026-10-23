// Replays the grid fit (mirrors inferGrid in jig.js) against column-gap pairs captured live from real sites via __jig.gridDebug. Keep in sync when the fit changes.
function fit(W, pairs) {
  const P = pairs.map(([r, l, w]) => ({ r, l, w })).filter(p => p.r > 2 && p.l < W - 2);
  const gapCount = new Map(); P.forEach(p => { const g = p.l - p.r; gapCount.set(g, (gapCount.get(g) || 0) + 1); });
  const gC = Array.from(new Set([...gapCount.keys(), 12, 16, 20, 24, 30, 32])); const total = P.reduce((a, p) => a + p.w, 0); const fits = [];
  gC.forEach(g => [3, 4, 5, 6, 8, 9, 10, 12, 16, 24].forEach(N => { const cw = (W - (N - 1) * g) / N; if (cw < 16) return; const pitch = cw + g;
    const onR = x => { const k = Math.round((x + g) / pitch); return k >= 1 && k < N && Math.abs(k * pitch - g - x) <= 2; }, onL = x => { const k = Math.round(x / pitch); return k >= 1 && k < N && Math.abs(k * pitch - x) <= 2; };
    const ok = p => Math.abs(p.l - p.r - g) <= 2 && onR(p.r) && onL(p.l);
    fits.push({ N, g, hit: P.reduce((a, p) => a + (ok(p) ? p.w : 0), 0) / total, n: P.filter(ok).length, rep: P.reduce((a, p) => a + (ok(p) && p.w > 1 ? p.w : 0), 0) }); }));
  const cand = fits.filter(f => f.n >= 2); const top = cand.length ? Math.max(...cand.map(f => f.hit)) : 0; const strong = cand.filter(f => f.n >= 3 && f.hit >= 0.15);
  if (!(top >= 0.3 || strong.length)) return 'not measured, top ' + top.toFixed(2);
  const pick = cand.filter(f => f.hit >= top - 0.03 && (top >= 0.3 || f.n >= 3)).sort((a, b) => Math.round((b.rep - a.rep) * 10) || a.N - b.N || (gapCount.get(b.g) || 0) - (gapCount.get(a.g) || 0) || b.hit - a.hit)[0];
  return `${pick.N} col · ${pick.g}px (hit ${pick.hit.toFixed(2)}, ${pick.n} gaps)`;
}
// relative to L0 (from live gridDebug)
const gw = [[597,634,3.32],[285,315,1.41],[600,630,1.41],[915,945,1.73],[200,220,4.24],[834,854,3.32],[713,725,1],[975,983,1.73],[222,252,1],[474,504,1],[726,756,1],[978,1008,1],[390,420,1]];
const ars = [[528,576,1],[371,391,2],[761,781,2],[556,576,1],[491,511,4.47],[640,680,1],[888,928,1]];
console.log('GeekWire', fit(1230, gw)); console.log('Ars', fit(1152, ars));
