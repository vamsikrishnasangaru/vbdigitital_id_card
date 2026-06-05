'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  dismissPwaInstallPrompt,
  getIsStandalone,
  getPwaPlatform,
  isMobileInstallContext,
  isPwaInstallDismissed,
  type PwaPlatform,
} from '@/lib/pwa-install';

export function usePwaInstall() {
  const [mounted, setMounted] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [platform, setPlatform] = useState<PwaPlatform>('desktop');
  const [isMobile, setIsMobile] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [canNativeInstall, setCanNativeInstall] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsStandalone(getIsStandalone());
    setPlatform(getPwaPlatform());
    setIsMobile(isMobileInstallContext());
    setDismissed(isPwaInstallDismissed());

    const onPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallPrompt(event);
      setCanNativeInstall(true);
    };

    const onDisplayMode = () => setIsStandalone(getIsStandalone());

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.matchMedia('(display-mode: standalone)').addEventListener('change', onDisplayMode);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', onDisplayMode);
    };
  }, []);

  const dismiss = useCallback(() => {
    dismissPwaInstallPrompt();
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return false;
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      setInstallPrompt(null);
      setCanNativeInstall(false);
      if (outcome === 'accepted') {
        setIsStandalone(getIsStandalone());
        return true;
      }
      return false;
    } finally {
      setInstalling(false);
    }
  }, [installPrompt]);

  const showBanner =
    mounted &&
    !isStandalone &&
    !dismissed &&
    isMobile &&
    (platform === 'ios' || platform === 'android' || canNativeInstall);

  return {
    mounted,
    isStandalone,
    platform,
    isMobile,
    dismissed,
    canNativeInstall,
    installing,
    showBanner,
    dismiss,
    install,
  };
}
