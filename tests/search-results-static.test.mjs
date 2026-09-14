import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('search results expose a local edit mode without unlocking the whole app',async()=>{
  const fusion=await read('layouts/fusion.js');
  const buildAsk=fusion.match(/function buildAsk\(core\)\{[\s\S]*?(?=\n\/\* ---------- 卡片)/)?.[0]||'';
  assert.match(buildAsk,/fx-res-edit-toggle/);
  assert.match(buildAsk,/aria-pressed/);
  assert.match(buildAsk,/homeDrop\.onclick/);
  assert.match(buildAsk,/core\.openItemEditor\(current\.item,current\.group\.id\)/);
  assert.doesNotMatch(buildAsk,/core\.setEditing\(/);
});

test('search rows drag stable ids to home, groups and expanded folders',async()=>{
  const [fusion,core]=await Promise.all([read('layouts/fusion.js'),read('shared/core.js')]);
  assert.match(fusion,/fx-res-home-drop/);
  assert.match(fusion,/drag=\{type:'search',iid:it\.id\}/);
  assert.match(fusion,/data-folder-id/);
  assert.match(fusion,/drag\.type==='search'/);
  const pinFavorite=core.match(/pinFavorite\(item\)\{[\s\S]*?(?=\n\s*setFavOrder)/)?.[0]||'';
  assert.match(pinFavorite,/favOrder[\s\S]*includes\(item\.id\)/);
  assert.match(pinFavorite,/favOrderAppend:item\.id/);
  assert.doesNotMatch(pinFavorite,/tgid|tfid/);
  assert.match(fusion,/pinSearchResult[\s\S]{0,420}core\.rerender\(\)/);
  assert.match(fusion,/\.fx-navitem\[data-gid\]:not\(\.fx-navfolder\)/);
  assert.doesNotMatch(fusion,/afterEl\(nav,'\.fx-navitem\[data-gid\]'/);
  assert.doesNotMatch(fusion,/\$\$\('\.fx-navitem\[data-gid\]',nav\)\.map/);
});

test('search management controls reuse design tokens and accessible target sizes',async()=>{
  const [css,design]=await Promise.all([read('layouts/fusion.css'),read('DESIGN.md')]);
  assert.match(design,/search-results-manager/);
  assert.match(css,/\.fx-res-tools/);
  assert.match(css,/\.fx-res-home-drop/);
  assert.match(css,/\.fx-res-edit-toggle/);
  assert.match(css,/min-height:\s*32px/);
  assert.match(css,/\.fx-res\.fx-dragging/);
});
