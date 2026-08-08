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
await containsFile('eval', files.eval, [/META-001/, /E2E-001/, /passes: false/]);

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label}: ${check.detail}`);
}

if (checks.some((check) => !check.ok)) process.exitCode = 1;
