#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [, , sourceArg, optimizedArg] = process.argv;
assert.ok(sourceArg && optimizedArg, 'usage: verify-bookmark-optimization.mjs <source> <optimized>');

const sourcePath = existsSync(sourceArg) ? sourceArg : join('/Users/Apple/Downloads', basename(sourceArg));
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const optimized = JSON.parse(readFileSync(optimizedArg, 'utf8'));
const stable = structuredClone(optimized);
delete stable.settings.widgets;

assert.deepEqual(optimized.favOrder, source.favOrder, 'homepage favorite order changed');
assert.equal(optimized.settings.showClock, true, 'clock visibility flag is not enabled');
assert.equal(optimized.settings.widgets.filter((widget) => widget?.type === 'clock').length, 1, 'optimized backup must contain exactly one clock widget');
assert.equal(createHash('sha256').update(JSON.stringify(stable)).digest('hex'), 'fa0b8cdab3cc06cecdea96b9d3e59e6fe215017d928ad849a4027267c6e33992', 'non-widget optimized data changed during clock repair');

console.log(JSON.stringify({ ok: true, source: sourcePath, optimized: optimizedArg, favoriteOrderPreserved: true, clockWidgets: 1, nonWidgetHash: 'fa0b8cdab3cc06cecdea96b9d3e59e6fe215017d928ad849a4027267c6e33992' }));
