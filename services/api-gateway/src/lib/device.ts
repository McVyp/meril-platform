import Bowser from "bowser";

export function parseDevice(ua: string | undefined) {
  if (!ua) return { deviceType: null, os: null, browser: null };
  try {
    const r = Bowser.parse(ua);
    return {
      deviceType: r.platform.type ?? null,
      os: r.os.name ?? null,
      browser: r.browser.name ?? null,
    };
  } catch {
    return { deviceType: null, os: null, browser: null };
  }
}
