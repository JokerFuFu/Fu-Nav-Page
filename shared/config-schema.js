import { splitSecrets } from './config-secrets.js';

const PROVIDERS = new Set(['bing', 'google', 'baidu', 'kimi', 'chatgpt', 'claude', 'perplexity', 'doubao', 'deepseek']);

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function defaultConfig() {
  return {
    version: 3,
    revision: 0,
    savedAt: 0,
    settings: {
      askProvider: 'bing',
      cloud: {
        enabled: false,
        type: 'webdav',
        url: '',
        gdriveClientId: '',
      },
    },
    groups: [],
  };
}

function validateItems(items, path, errors, depth = 0) {
  if (!Array.isArray(items)) {
    errors.push({ path, message: '必须是数组' });
    return;
  }
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!item || typeof item !== 'object') {
      errors.push({ path: itemPath, message: '必须是对象' });
      return;
    }
    if (typeof item.id !== 'string' || !item.id) errors.push({ path: `${itemPath}.id`, message: '必须是非空字符串' });
    if (item.type === 'folder') {
      if (depth >= 2) errors.push({ path: `${itemPath}.items`, message: '文件夹深度不能超过两级' });
      validateItems(item.items, `${itemPath}.items`, errors, depth + 1);
    } else if (typeof item.url !== 'string' || !item.url.trim()) {
      errors.push({ path: `${itemPath}.url`, message: '必须是非空字符串' });
    }
  });
}

export function validateConfig(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: [{ path: '$', message: '配置必须是对象' }] };
  }
  if (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings)) {
    errors.push({ path: 'settings', message: '必须是对象' });
  }
  if (!Array.isArray(input.groups)) {
    errors.push({ path: 'groups', message: '必须是数组' });
  } else {
    input.groups.forEach((group, index) => {
      const path = `groups[${index}]`;
      if (!group || typeof group !== 'object') {
        errors.push({ path, message: '必须是对象' });
        return;
      }
      if (typeof group.id !== 'string' || !group.id) errors.push({ path: `${path}.id`, message: '必须是非空字符串' });
      validateItems(group.items, `${path}.items`, errors);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function migrateConfig(input, now = Date.now()) {
  const before = clone(input || {});
  const { config, secrets } = splitSecrets(before);
  const safeBefore = JSON.stringify(config);
  const fallback = defaultConfig();

  if (!config.settings || typeof config.settings !== 'object' || Array.isArray(config.settings)) config.settings = fallback.settings;
  if (!Array.isArray(config.groups)) config.groups = [];
  if (!config.settings.cloud || typeof config.settings.cloud !== 'object' || Array.isArray(config.settings.cloud)) {
    config.settings.cloud = clone(fallback.settings.cloud);
  }

  const legacyProvider = config.settings.searchEngine;
  if (!PROVIDERS.has(config.settings.askProvider)) {
    config.settings.askProvider = PROVIDERS.has(legacyProvider) ? legacyProvider : 'bing';
  }
  delete config.settings.searchEngine;

  config.version = 3;
  if (!Number.isFinite(config.revision)) config.revision = 0;
  if (!Number.isFinite(config.savedAt)) config.savedAt = Number.isFinite(now) ? now : 0;

  const validation = validateConfig(config);
  return {
    config,
    secrets,
    changed: JSON.stringify(config) !== safeBefore,
    warnings: validation.errors,
  };
}
