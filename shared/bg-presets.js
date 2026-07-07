/* ============ 首页背景 · 预置壁纸元数据 ============
 * 每个预置图现在有 dark/light 两个变体，深浅主题切换时 shared/background.js 会自动挑对应的。
 * 壁纸为 AI 生成（2026-07），可随本项目 MIT 协议自由再分发。 */
export const PRESETS = [
  { id:'p01', name:'晨雾靛蓝', dark:'icons/backgrounds/p01.jpg', light:'icons/backgrounds/p01-light.jpg' },
  { id:'p02', name:'深海青',   dark:'icons/backgrounds/p02.jpg', light:'icons/backgrounds/p02-light.jpg' },
  { id:'p03', name:'暮色紫',   dark:'icons/backgrounds/p03.jpg', light:'icons/backgrounds/p03-light.jpg' },
  { id:'p04', name:'暖橙点缀', dark:'icons/backgrounds/p04.jpg', light:'icons/backgrounds/p04-light.jpg' },
];
export const DEFAULT_PRESET_ID = 'p01';
