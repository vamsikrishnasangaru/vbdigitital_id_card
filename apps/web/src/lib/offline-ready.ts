export type OfflineReadyStatus = 'idle' | 'preparing' | 'ready';

export type OfflineReadyState = {
  status: OfflineReadyStatus;
  progress: number;
  secondsLeft: number;
  message: string;
};

const EVENT = 'vb-offline-ready-changed';

let state: OfflineReadyState = {
  status: 'idle',
  progress: 0,
  secondsLeft: 0,
  message: '',
};

function emit() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...state } }));
}

export function getOfflineReadyState(): OfflineReadyState {
  return state;
}

export function offlineReadyEventName(): string {
  return EVENT;
}

export function setOfflineReadyPreparing(totalSeconds: number) {
  // Never regress from ready — a second warm (Strict Mode / remount) was wiping the toast.
  if (state.status === 'ready') return;
  state = {
    status: 'preparing',
    progress: 0,
    secondsLeft: Math.max(1, totalSeconds),
    message: 'Preparing offline mode…',
  };
  emit();
}

export function setOfflineReadyProgress(progress: number, secondsLeft: number) {
  if (state.status === 'ready') return;
  state = {
    status: 'preparing',
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    secondsLeft: Math.max(0, secondsLeft),
    message: 'Preparing offline mode…',
  };
  emit();
}

export function setOfflineReadyComplete() {
  if (state.status === 'ready') return;
  state = {
    status: 'ready',
    progress: 100,
    secondsLeft: 0,
    message: 'Offline ready',
  };
  emit();
}
