const PS4_PATTERN = /PlayStation 4/i;
const PS5_PATTERN = /PlayStation 5/i;

export function classifyUserAgent(userAgent = '') {
  if (PS4_PATTERN.test(userAgent)) return { platform: 'ps4', supported: true };
  if (PS5_PATTERN.test(userAgent)) return { platform: 'ps5', supported: true };
  return { platform: 'unknown', supported: false };
}

export function resolvePreviewPlatform(userAgent = '', search = '') {
  const detected = classifyUserAgent(userAgent);
  const params = new URLSearchParams(search);
  if (detected.supported || params.get('preview') !== '1') {
    return { ...detected, preview: false };
  }
  const platform = params.get('platform') === 'ps5' ? 'ps5' : 'ps4';
  return { platform, supported: true, preview: true };
}

export function nextView({ authorized, platform }) {
  if (!authorized) return 'waiting';
  return platform === 'ps5' ? 'ps5-entry' : 'ps4-entry';
}
