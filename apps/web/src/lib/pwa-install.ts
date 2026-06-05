export const PWA_INSTALL_DISMISS_KEY = 'vb-pwa-install-dismissed';

export type PwaPlatform = 'ios' | 'android' | 'desktop';

export function getIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function getPwaPlatform(): PwaPlatform {
  if (typeof window === 'undefined') return 'desktop';
  const ua = window.navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function isMobileInstallContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (getPwaPlatform() !== 'desktop') return true;
  return window.matchMedia('(max-width: 1023px)').matches;
}

export function isPwaInstallDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(PWA_INSTALL_DISMISS_KEY) === '1';
}

export function dismissPwaInstallPrompt(): void {
  localStorage.setItem(PWA_INSTALL_DISMISS_KEY, '1');
}

export function resetPwaInstallDismiss(): void {
  localStorage.removeItem(PWA_INSTALL_DISMISS_KEY);
}

export function getAppOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}
