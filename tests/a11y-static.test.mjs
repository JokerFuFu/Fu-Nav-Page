import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('dialogs expose names and use a focus-managed dialog primitive', async () => {
  const core = await read('shared/core.js');
  assert.match(core, /role="dialog" aria-modal="true" aria-labelledby="fnMTitle"/);
  assert.match(core, /role="dialog" aria-modal="true" aria-label="搜索与命令"/);
  assert.match(core, /openDialog\(\{title,content,actions=\[\],initialFocus,onClose,wide=false\}\)/);
  assert.match(core, /if\(e\.key==='Tab'\).*trapDialogFocus/s);
  assert.match(core, /this\._dialogTrigger\.focus\(\)/);
});

test('generated form labels and icon-only controls have accessible names', async () => {
  const [core, popup, fusion, iconEditor] = await Promise.all([
    read('shared/core.js'),
    read('popup.js'),
    read('layouts/fusion.js'),
    read('shared/icon-editor.js'),
  ]);
  assert.match(core, /label\.htmlFor=input\.id/);
  assert.match(popup, /label\.htmlFor=control\.id/);
  assert.match(core, /id="fnMClose" title="关闭" aria-label="关闭"/);
  assert.match(fusion, /prov\.setAttribute\('aria-label','切换搜索引擎 \/ AI'\)/);
  assert.match(fusion, /collapseBtn\.setAttribute\('aria-expanded'/);
  assert.match(fusion, /row\.setAttribute\('aria-expanded'/);
  for (const name of ['搜索或询问', '添加待办', '倒数日名称', '倒数日日期', '添加倒数日', '自定义壁纸图片地址']) {
    assert.ok(fusion.includes(`'aria-label','${name}'`), `missing accessible name: ${name}`);
  }
  assert.match(iconEditor, /label\.htmlFor=control\.id/);
  assert.match(iconEditor, /setAttribute\('aria-label',`选择 \$\{slug\} 图标`\)/);
  assert.match(core, /agentTokenI\.type='password'/);
  assert.match(core, /this\.field\('本机 Agent Token',agentTokenI\)/);
});

test('custom menus implement the ARIA menu keyboard model', async () => {
  const fusion = await read('layouts/fusion.js');
  assert.match(fusion, /ctxMenu\.setAttribute\('role','menu'\)/);
  assert.match(fusion, /b\.setAttribute\('role','menuitem'\)/);
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape']) {
    assert.ok(fusion.includes(`'${key}'`), `missing menu key: ${key}`);
  }
  assert.match(fusion, /function openMenu\(anchor,items\)/);
  assert.match(fusion, /menu\.setAttribute\('role','menu'\)/);
});

test('status feedback is routed through polite live regions', async () => {
  const [core, popup] = await Promise.all([read('shared/core.js'), read('popup.js')]);
  assert.match(core, /id="fnAnnouncer"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(core, /announce\(message\)/);
  assert.match(core, /toast\(msg,kind,action\).*this\.announce\(msg\)/s);
  assert.match(core, /flashSync\(msg\).*this\.announce\(msg\)/s);
  assert.match(popup, /status\.setAttribute\('role','status'\)/);
  assert.match(popup, /status\.setAttribute\('aria-live','polite'\)/);
});
