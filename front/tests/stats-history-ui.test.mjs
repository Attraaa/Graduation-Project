import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function load(entry) {
  const bundle = await build({ entryPoints: [entry], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
  return compiled.exports.default;
}
const StatTile = await load('src/features/statistics/StatTile.tsx');
const html = (component, props) => renderToStaticMarkup(createElement(component, props));

test('number tiles keep missing apart from zero and show comparison chips', () => {
  const missing = html(StatTile, { label: '목 평균 점수', value: '—', unit: '점' });
  assert.match(missing, /—/);
  assert.doesNotMatch(missing, />점</);
  const zero = html(StatTile, { label: '기준에서 벗어남', value: '0', unit: '회', detail: '벗어나 있던 시간 0%' });
  assert.match(zero, />0</);
  assert.match(zero, />회</);
  assert.match(zero, /벗어나 있던 시간 0%/);
  assert.match(html(StatTile, { label: '목 평균 점수', value: '84', unit: '점', chip: { text: '직전 7일보다 +3', tone: 'good' } }),
    /직전 7일보다 \+3/);
  assert.match(html(StatTile, { label: '깜빡임 빈도', value: '14', unit: '회/분', chip: { text: '직전 7일 13회/분', tone: 'neutral' } }),
    /직전 7일 13회\/분/);
});
