const TRACKING_KEYS = new Set(['fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid']);

function cleanParams(url) {
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_KEYS.has(lower)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
}

export function normalizeUrl(value, mode = 'strict') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    cleanParams(url);
    url.hash = '';
    if (mode === 'relaxed') {
      if (url.protocol === 'http:' || url.protocol === 'https:') url.protocol = 'https:';
      url.hostname = url.hostname.replace(/^www\./i, '');
    }
    let path = url.pathname || '';
    if (path === '/') path = '';
    else path = path.replace(/\/+$/, '');
    const query = url.searchParams.toString();
    return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return raw.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

export function classifyDuplicate(a, b) {
  const left = normalizeUrl(a, 'strict');
  const right = normalizeUrl(b, 'strict');
  if (left && left === right) return { level: 'exact', left, right };
  const relaxedLeft = normalizeUrl(a, 'relaxed');
  const relaxedRight = normalizeUrl(b, 'relaxed');
  if (relaxedLeft && relaxedLeft === relaxedRight) return { level: 'possible', left, right };
  return { level: 'distinct', left, right };
}
