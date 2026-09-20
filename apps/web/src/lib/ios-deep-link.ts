export function isIOSDevice(navigator: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function iosTrackingURL(nonce: string, token: string): string {
  return `toquetin://tracking/${encodeURIComponent(nonce)}#${encodeURIComponent(token)}`;
}
