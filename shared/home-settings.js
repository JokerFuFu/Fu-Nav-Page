export function homeDensity(width, height) {
  if (Number(width) < 760) return 'mobile';
  if (Number(height) < 820) return 'compact';
  return 'comfortable';
}

export function visibleWidgets(settings = {}) {
  const disabled = new Set(Array.isArray(settings.disabledWidgets) ? settings.disabledWidgets : []);
  return (Array.isArray(settings.widgets) ? settings.widgets : []).filter((widget) => {
    if (!widget || disabled.has(widget.id)) return false;
    if (widget.type === 'clock' && settings.showClock === false) return false;
    if (widget.type === 'weather' && settings.showWeather === false) return false;
    if (widget.type === 'hwmon' && !String(widget.url || '').trim()) return false;
    return true;
  });
}
