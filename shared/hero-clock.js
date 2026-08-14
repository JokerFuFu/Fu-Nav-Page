const OPTIONS = {
  font: new Set(['system', 'rounded', 'serif', 'mono']),
  size: new Set(['compact', 'standard', 'large']),
  weight: new Set(['light', 'regular', 'bold']),
  style: new Set(['solid', 'shadow', 'outline']),
  format: new Set(['24', '12']),
  details: new Set(['time', 'date', 'full']),
  colorMode: new Set(['auto', 'light', 'dark', 'custom']),
};

export const HERO_CLOCK_DEFAULTS = Object.freeze({
  font: 'system',
  size: 'standard',
  weight: 'regular',
  style: 'shadow',
  format: '24',
  details: 'full',
  colorMode: 'auto',
  customColor: '#f5f7ff',
});

const normalizeHex = value => /^#[0-9a-f]{6}$/i.test(String(value || ''))
  ? String(value).toLowerCase()
  : HERO_CLOCK_DEFAULTS.customColor;

export function normalizeHeroClock(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const result = {};
  for (const key of Object.keys(OPTIONS)) {
    result[key] = OPTIONS[key].has(source[key]) ? source[key] : HERO_CLOCK_DEFAULTS[key];
  }
  result.customColor = normalizeHex(source.customColor);
  return result;
}

export function migrateHeroClock(settings = {}) {
  const beforeWidgets = Array.isArray(settings.widgets) ? settings.widgets : [];
  const widgets = beforeWidgets.filter(widget => widget?.type !== 'clock');
  const heroClock = normalizeHeroClock(settings.heroClock);
  const changed = !Array.isArray(settings.widgets)
    || widgets.length !== beforeWidgets.length
    || JSON.stringify(settings.heroClock || null) !== JSON.stringify(heroClock);
  settings.widgets = widgets;
  settings.heroClock = heroClock;
  return changed;
}

export function formatHeroClock(value = new Date(), input = {}) {
  const date = value instanceof Date ? value : new Date(value);
  const config = normalizeHeroClock(input);
  const pad = number => String(number).padStart(2, '0');
  const hour = date.getHours();
  const minute = pad(date.getMinutes());
  const time = config.format === '12'
    ? `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`
    : `${pad(hour)}:${minute}`;
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  const greeting = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : hour < 22 ? '晚上好' : '夜深了';
  return {
    time,
    date: `${date.getMonth() + 1}月${date.getDate()}日 周${weekday}`,
    greeting,
    showDate: config.details !== 'time',
    showGreeting: config.details === 'full',
    datetime: date.toISOString(),
  };
}

const channel = value => {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

export function hexLuminance(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!match) return null;
  const [red, green, blue] = match.slice(1).map(part => channel(parseInt(part, 16)));
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function contrastRatio(first, second) {
  if (![first, second].every(Number.isFinite)) return 0;
  const high = Math.max(first, second);
  const low = Math.min(first, second);
  return (high + 0.05) / (low + 0.05);
}

export function chooseHeroClockTone({ luminance, scrimOpacity = 0 } = {}) {
  if (!Number.isFinite(luminance)) return null;
  const source = Math.min(1, Math.max(0, luminance));
  const scrim = Math.min(1, Math.max(0, Number(scrimOpacity) || 0));
  const backgroundLuminance = source * (1 - scrim);
  const candidates = [
    { tone: 'light', color: '#f5f7ff', luminance: hexLuminance('#f5f7ff') },
    { tone: 'dark', color: '#15161c', luminance: hexLuminance('#15161c') },
  ].map(candidate => ({ ...candidate, contrast: contrastRatio(candidate.luminance, backgroundLuminance) }));
  const winner = candidates.sort((a, b) => b.contrast - a.contrast)[0];
  return { tone: winner.tone, color: winner.color, contrast: winner.contrast, backgroundLuminance };
}

export function coverSourceRect(imageWidth, imageHeight, viewportWidth, viewportHeight, region = {}) {
  if (![imageWidth, imageHeight, viewportWidth, viewportHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const normalized = {
    x: Math.min(1, Math.max(0, Number(region.x) || 0)),
    y: Math.min(1, Math.max(0, Number(region.y) || 0)),
    width: Math.min(1, Math.max(0, Number(region.width) || 1)),
    height: Math.min(1, Math.max(0, Number(region.height) || 1)),
  };
  const scale = Math.max(viewportWidth / imageWidth, viewportHeight / imageHeight);
  const visibleWidth = viewportWidth / scale;
  const visibleHeight = viewportHeight / scale;
  const cropX = (imageWidth - visibleWidth) / 2;
  const cropY = (imageHeight - visibleHeight) / 2;
  return {
    x: cropX + normalized.x * visibleWidth,
    y: cropY + normalized.y * visibleHeight,
    width: Math.min(visibleWidth * normalized.width, imageWidth - cropX - normalized.x * visibleWidth),
    height: Math.min(visibleHeight * normalized.height, imageHeight - cropY - normalized.y * visibleHeight),
  };
}

export function averageImageDataLuminance(data) {
  if (!data || typeof data.length !== 'number') return null;
  let total = 0, weight = 0;
  for (let index = 0; index + 3 < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha <= 0.01) continue;
    total += (channel(data[index]) * 0.2126 + channel(data[index + 1]) * 0.7152 + channel(data[index + 2]) * 0.0722) * alpha;
    weight += alpha;
  }
  return weight ? total / weight : null;
}

export function sampleCoverRegionLuminance(url, options = {}) {
  if (!url || typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve(null);
  const viewportWidth = Number(options.viewportWidth) || globalThis.innerWidth || 1;
  const viewportHeight = Number(options.viewportHeight) || globalThis.innerHeight || 1;
  const region = options.region || { x: 0.28, y: 0.03, width: 0.56, height: 0.3 };
  return new Promise(resolve => {
    const image = new Image();
    const finish = value => { image.onload = image.onerror = null; resolve(value); };
    image.onload = () => {
      try {
        const source = coverSourceRect(image.naturalWidth, image.naturalHeight, viewportWidth, viewportHeight, region);
        if (!source || source.width <= 0 || source.height <= 0) return finish(null);
        const canvas = document.createElement('canvas'); canvas.width = 56; canvas.height = 30;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return finish(null);
        context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
        finish(averageImageDataLuminance(context.getImageData(0, 0, canvas.width, canvas.height).data));
      } catch { finish(null); }
    };
    image.onerror = () => finish(null);
    image.src = url;
  });
}
