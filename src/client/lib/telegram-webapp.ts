interface TelegramWebApp {
  ready?: () => void;
  expand?: () => void;
  colorScheme?: 'light' | 'dark';
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function initTelegramMiniApp(): 'light' | 'dark' | null {
  if (typeof window === 'undefined') return null;
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return null;

  webApp.ready?.();
  webApp.expand?.();
  return webApp.colorScheme ?? null;
}

export function triggerHaptic(
  kind: 'impact' | 'success' | 'error' = 'impact',
): void {
  if (typeof window === 'undefined') return;
  const feedback = window.Telegram?.WebApp?.HapticFeedback;
  if (!feedback) return;

  if (kind === 'impact') {
    feedback.impactOccurred?.('light');
  } else {
    feedback.notificationOccurred?.(kind);
  }
}
