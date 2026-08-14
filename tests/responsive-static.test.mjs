import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [layout, css, base, background, design, popupCss] = await Promise.all([
  readFile('layouts/fusion.js', 'utf8'),
  readFile('layouts/fusion.css', 'utf8'),
  readFile('shared/base.css', 'utf8'),
  readFile('shared/background.js', 'utf8'),
  readFile('DESIGN.md', 'utf8'),
  readFile('popup.css', 'utf8'),
]);
const luminance = rgb => rgb.map(value=>value/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
const contrast = (a,b) => { const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x); return (hi+0.05)/(lo+0.05); };

test('mobile sidebar is a fixed dismissible drawer with scroll guard', () => {
  assert.match(layout, /export function setSidebarOpen\(value\)/);
  for (const hook of ['fx-mobile-menu', 'fx-side-scrim', 'fx-side-close']) assert.match(layout, new RegExp(hook));
  assert.match(layout, /Escape[\s\S]{0,160}setSidebarOpen\(false\)/);
  assert.match(layout, /function sideBtn[\s\S]{0,240}setSidebarOpen\(false\)/);

  const mobile = css.match(/@media \(max-width:760px\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(mobile, /\.lay-fusion \.fx-side\s*\{[^}]*position:fixed/);
  assert.match(mobile, /transform:translateX\(-/);
  assert.match(mobile, /\.lay-fusion\.sidebar-open \.fx-side\s*\{[^}]*transform:translateX\(0\)/);
  assert.match(mobile, /\.fx-side-scrim/);
  assert.match(mobile, /body\.sidebar-open\s*\{[^}]*overflow:hidden/);
  assert.match(css, /\.fx-home\s*\{[^}]*padding-top:72px/);
});

test('sparse content is width-limited and folder metadata stays visible in grid view', () => {
  assert.match(layout, /home-compact/);
  assert.match(layout, /content-sparse/);
  assert.match(css, /\.fx-main\.content-sparse[\s\S]{0,180}max-width/);
  assert.match(layout, /fx-folder-count/);
  const folderMeta = layout.match(/function folderCard[\s\S]*?return a;/)?.[0] || '';
  assert.doesNotMatch(folderMeta, /fx-card-url[^\n]*stats\.sites/);
  assert.match(css, /\.fx-folder-count\s*\{[^}]*display:block/);
});

test('homepage primary task and incomplete favorite rows stay optically centered', () => {
  assert.match(layout, /fx-home-primary/);
  assert.match(layout, /widgets\.childElementCount/);
  assert.match(layout, /fx-favs cols-/);
  assert.match(css, /\.fx-home\.no-widgets \.fx-home-primary\s*\{[^}]*min-height:calc\(100dvh - 2 \* var\(--home-pad\)\)/);
  assert.match(css, /\.fx-home-primary\s*\{[^}]*justify-content:center/);
  assert.match(css, /\.fx-favs\s*\{[^}]*display:flex[^}]*justify-content:center/);
  assert.match(css, /\.fx-favs\.cols-8 \.fx-fav\s*\{[^}]*flex:/);
  assert.match(css, /\.fx-favs\.cols-6 \.fx-fav\s*\{[^}]*flex:/);

  const mobile = css.match(/@media \(max-width:760px\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(mobile, /\.fx-home-primary\s*\{[^}]*min-height:0/);
  assert.match(mobile, /\.fx-favs \.fx-fav\s*\{[^}]*flex:/);
  assert.match(design, /\.fx-home-primary/);
});

test('background scrim and metadata tokens preserve readable small text', async () => {
  const module = await import(`../shared/background.js?responsive=${Date.now()}`);
  assert.equal(typeof module.resolveBackgroundScrim, 'function');
  assert.ok(module.resolveBackgroundScrim('dark', 0) >= 0.5);
  assert.ok(module.resolveBackgroundScrim('light', 0) >= 0.4);
  assert.match(base, /--photo-meta:/);
  assert.match(base, /--surface-glass:\s*rgba\(20,20,23,\.78\)/);
  assert.match(base, /body\[data-theme="light"\][\s\S]*?--surface-glass:\s*rgba\(255,255,255,\.84\)/);
  assert.match(base, /body\[data-theme="light"\][\s\S]*?--photo-meta:#414656/);
  assert.match(base, /prefers-color-scheme: light[\s\S]*?--photo-meta:#414656/);
  assert.match(base, /body\.bg-photo[^{]*\.fx-wcw-sub/);
  assert.match(design, /content-sparse/);
  const darkGlass=[20,20,23].map((value,index)=>value*0.78+[255,255,255][index]*0.22);
  const darkMeta=darkGlass.map(value=>255*0.84+value*0.16);
  const lightGlass=[255,255,255].map(value=>value*0.84);
  assert.ok(contrast(darkMeta,darkGlass)>=4.5, 'dark photo metadata must pass AA over the brightest image');
  assert.ok(contrast([65,70,86],lightGlass)>=4.5, 'light photo metadata must pass AA over the darkest image');
});

test('drawer and new motion states are neutralized by reduced motion', () => {
  const reduced = `${base}\n${css}`.match(/@media \(prefers-reduced-motion:\s*reduce\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(reduced, /transition-duration:\.01ms\s*!important/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)\{[\s\S]*?\.fx-side[\s\S]*?transition-duration:\.01ms\s*!important/);
});

test('action popup declares a stable preferred width without viewport-unit negotiation', () => {
  assert.match(popupCss, /body\s*\{[^}]*width:420px/);
  assert.doesNotMatch(popupCss, /body\s*\{[^}]*\b(?:min-|max-)?width:[^;}]*vw/);
  assert.match(popupCss, /overflow-x:hidden/);
});
