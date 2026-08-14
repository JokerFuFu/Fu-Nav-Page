import { readFile } from 'node:fs/promises';

const files = {
  spec: 'docs/superpowers/specs/2026-08-09-product-experience-upgrade-design.md',
  plan: 'docs/superpowers/plans/2026-08-09-product-experience-upgrade-plan.md',
  eval: 'eval.md',
};

const checks = [];

async function containsFile(label, path, patterns) {
  try {
    const text = await readFile(path, 'utf8');
    const missing = patterns.filter((pattern) => !pattern.test(text));
    checks.push({
      label,
      ok: missing.length === 0,
      detail: missing.length ? `missing ${missing.map(String).join(', ')}` : path,
    });
  } catch (error) {
    checks.push({ label, ok: false, detail: error.message });
  }
}

await containsFile('spec', files.spec, [/P0/, /P1/, /P2/, /eval\.md/]);
await containsFile('plan', files.plan, [/P0/, /P1/, /P2/, /eval\.md/]);
await containsFile('eval', files.eval, [/META-001/, /E2E-001/, /passes: (?:true|false)/]);

try {
  const iconRuntime = await Promise.all([
    'newtab.html', 'popup.html', 'shared/icon-map.js', 'shared/icons.js',
    'shared/icon-editor.js', 'layouts/fusion.js',
  ].map(path => readFile(path, 'utf8')));
  const combined = iconRuntime.join('\n');
  checks.push({
    label: 'offline icon boundary',
    ok: !/@(?:latest|main)(?:\/|\b)/i.test(combined)
      && !/rel=["']preconnect["']/i.test(iconRuntime[0] + iconRuntime[1])
      && /data:image\/svg\+xml/.test(combined),
    detail: 'local core icons, pinned brand fallbacks, no remote preconnect',
  });

  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  const readme = await readFile('README.md', 'utf8');
  const permissions = [...manifest.permissions, ...manifest.optional_permissions];
  const hosts = [...manifest.host_permissions, ...manifest.optional_host_permissions];
  const labels = hosts.map(pattern => pattern.includes('127.0.0.1') ? '127.0.0.1'
    : pattern === '*://*/*' ? pattern
      : new URL(pattern.replace('*.', 'wildcard.')).hostname.replace(/^wildcard\./, ''));
  checks.push({
    label: 'manifest disclosures',
    ok: !/hitokoto/i.test(JSON.stringify(manifest))
      && permissions.every(value => readme.includes(value))
      && labels.every(value => readme.includes(value)),
    detail: 'permissions and host permissions disclosed in README',
  });
} catch (error) {
  checks.push({ label: 'offline and permission checks', ok: false, detail: error.message });
}

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label}: ${check.detail}`);
}

if (checks.some((check) => !check.ok)) process.exitCode = 1;
