import test from 'node:test';
import assert from 'node:assert/strict';
import { filterContent, filterKeyAction, setAskProvider, submitAsk } from '../shared/provider-action.js';

const providers = {
  bing: { name: 'Bing', kind: 'search', q: 'https://www.bing.com/search?q=' },
  kimi: { name: 'Kimi', kind: 'ai', home: 'https://www.kimi.com/', copy: true },
};

test('provider switching updates askProvider without submitting or opening', () => {
  const settings = { askProvider: 'bing' };
  let opened = 0;

  const changed = setAskProvider(settings, providers, 'kimi', () => { opened += 1; });

  assert.deepEqual(changed, { ok: true, providerId: 'kimi', submitted: false });
  assert.equal(settings.askProvider, 'kimi');
  assert.equal(opened, 0);
});

test('submit opens exactly once and publishes copy feedback before navigation', () => {
  const settings = { askProvider: 'kimi' };
  const events = [];

  const result = submitAsk('explain this', {
    settings,
    providers,
    copy: () => { events.push('copy'); return true; },
    feedback: (message) => events.push(`feedback:${message}`),
    opener: (url) => events.push(`open:${url}`),
  });

  assert.equal(result.submitted, true);
  assert.equal(result.copied, true);
  assert.equal(events.length, 3);
  assert.equal(events[0], 'copy');
  assert.match(events[1], /已复制/);
  assert.equal(events[2], 'open:https://www.kimi.com/');
});

test('group filtering and Enter remain local while Escape clears', () => {
  const entries = [
    { name: 'GitHub', url: 'https://github.com', note: 'code' },
    { name: '知乎', url: 'https://zhihu.com', note: '阅读' },
  ];

  assert.deepEqual(filterContent(entries, 'code').map((item) => item.name), ['GitHub']);
  assert.deepEqual(filterKeyAction('Enter'), { prevented: true, clear: false, submitted: false });
  assert.deepEqual(filterKeyAction('Escape'), { prevented: true, clear: true, submitted: false });
});
