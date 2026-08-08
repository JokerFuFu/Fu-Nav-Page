const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function cleanCloudUrl(value, secrets) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (url.username && !hasOwn(secrets, 'cloudUser')) secrets.cloudUser = decodeURIComponent(url.username);
    if (url.password && !hasOwn(secrets, 'cloudPass')) secrets.cloudPass = decodeURIComponent(url.password);
    url.username = '';
    url.password = '';
    return url.href;
  } catch {
    return value;
  }
}

export function sanitizeConfig(input) {
  const config = clone(input || {});
  const settings = config.settings;
  if (settings && typeof settings === 'object') {
    delete settings.agentToken;
    const cloud = settings.cloud;
    if (cloud && typeof cloud === 'object') {
      delete cloud.user;
      delete cloud.pass;
      delete cloud.password;
      delete cloud.token;
      delete cloud.accessToken;
      delete cloud.refreshToken;
      cloud.url = cleanCloudUrl(cloud.url, {});
    }
  }
  delete config.secrets;
  return config;
}

export function splitSecrets(input) {
  const runtime = clone(input || {});
  const settings = runtime.settings || {};
  const cloud = settings.cloud || {};
  const secrets = {};

  if (hasOwn(settings, 'agentToken')) secrets.agentToken = String(settings.agentToken ?? '');
  if (hasOwn(cloud, 'user')) secrets.cloudUser = String(cloud.user ?? '');
  if (hasOwn(cloud, 'pass')) secrets.cloudPass = String(cloud.pass ?? '');
  cloud.url = cleanCloudUrl(cloud.url, secrets);

  return { config: sanitizeConfig(runtime), secrets };
}

export function injectSecrets(input, secrets = {}) {
  const config = clone(input || {});
  const settings = config.settings || (config.settings = {});
  const cloud = settings.cloud || (settings.cloud = {});

  if (hasOwn(secrets, 'agentToken')) settings.agentToken = String(secrets.agentToken ?? '');
  if (hasOwn(secrets, 'cloudUser')) cloud.user = String(secrets.cloudUser ?? '');
  if (hasOwn(secrets, 'cloudPass')) cloud.pass = String(secrets.cloudPass ?? '');

  return config;
}
