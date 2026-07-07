/* ============ 强调色预设（深浅主题各一套值）============
 * 每个预设的 dark/light 值都要过 WCAG AA：accent-strong 承载白字(主按钮)需要 ≥4.5:1，
 * accent 用在链接/图标/聚焦环，对比度要求略低但也需清晰可辨。以下是候选初始值，
 * 实施时用对比度工具核对一遍，不达标就把该颜色的明度往深(浅色主题)/往亮(深色主题)调。 */
export const ACCENTS = [
  { id:'indigo',  name:'靛蓝（默认）', dark:{accent:'#6e7bff', strong:'#4a55f3', ring:'rgba(110,123,255,.28)'}, light:{accent:'#4a55f3', strong:'#4a55f3', ring:'rgba(74,85,243,.22)'} },
  { id:'teal',    name:'青',           dark:{accent:'#2dd4bf', strong:'#0d9488', ring:'rgba(45,212,191,.28)'},  light:{accent:'#0d9488', strong:'#0d9488', ring:'rgba(13,148,136,.22)'} },
  { id:'emerald', name:'绿',           dark:{accent:'#34d399', strong:'#059669', ring:'rgba(52,211,153,.28)'},  light:{accent:'#059669', strong:'#059669', ring:'rgba(5,150,105,.22)'} },
  { id:'amber',   name:'琥珀',         dark:{accent:'#f5b454', strong:'#b45309', ring:'rgba(245,180,84,.28)'},  light:{accent:'#b45309', strong:'#b45309', ring:'rgba(180,83,9,.22)'} },
  { id:'violet',  name:'紫',           dark:{accent:'#a78bfa', strong:'#7c3aed', ring:'rgba(167,139,250,.28)'}, light:{accent:'#7c3aed', strong:'#7c3aed', ring:'rgba(124,58,237,.22)'} },
  { id:'rose',    name:'玫红',         dark:{accent:'#fb7ba0', strong:'#be123c', ring:'rgba(251,123,160,.28)'}, light:{accent:'#be123c', strong:'#be123c', ring:'rgba(190,18,60,.22)'} },
];
export const DEFAULT_ACCENT_ID = 'indigo';
