/**
 * A starting name for this browser, from its user agent: "Chrome on Linux".
 * Only a suggestion the person can change; it is encrypted before it leaves.
 */
export function defaultDeviceName(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /(Headless)?Chrome\//.test(ua)
        ? 'Chrome'
        : /Version\/[\d.]+.*Safari\//.test(ua)
          ? 'Safari'
          : null;
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null;
  if (!browser) return 'This browser';
  return os ? `${browser} on ${os}` : browser;
}
