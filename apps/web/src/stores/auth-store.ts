import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER';
  schoolId: string | null;
  school: { id: string; name: string; code: string; logoUrl?: string } | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  /** Uploads anything still queued before clearing the session. */
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  initialize: () => void;
}

function clearSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('loginTimestamp');
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  login: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('loginTimestamp', String(Date.now()));
    set({ user, isAuthenticated: true, isLoading: false });
    // Upload anything queued while the previous session was expired/offline.
    void import('@/lib/sync-engine').then(({ syncEngine }) => syncEngine.flushQueue());
  },

  logout: async () => {
    // Flush while the token is still valid — afterwards every request 401s and
    // the work would sit on the device until the next sign-in.
    try {
      if (navigator.onLine && localStorage.getItem('accessToken')) {
        const { syncEngine } = await import('@/lib/sync-engine');
        await syncEngine.flushQueue();

        const remaining = await syncEngine.getQueueLength();
        if (remaining > 0) {
          const { toast } = await import('sonner');
          toast.warning(
            `${remaining} change${remaining === 1 ? '' : 's'} could not be uploaded. ` +
              'They stay saved on this device and sync the next time you sign in.',
          );
        }
      }
    } catch {
      /* queue is preserved; it syncs after the next sign-in */
    }

    clearSession();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },

  initialize: () => {
    if (typeof window === 'undefined') { set({ isLoading: false }); return; }
    const userStr = localStorage.getItem('user');
    const token = localStorage.getItem('accessToken');
    if (userStr && token) {
      try {
        const user = JSON.parse(userStr);
        // Non-super-admin sessions expire after 7 days (client-side enforcement for offline)
        if (user.role !== 'SUPER_ADMIN') {
          const loginTs = Number(localStorage.getItem('loginTimestamp') || '0');
          const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
          if (loginTs > 0 && Date.now() - loginTs > SESSION_MAX_MS) {
            clearSession();
            set({ user: null, isAuthenticated: false, isLoading: false });
            return;
          }
        }
        set({ user, isAuthenticated: true, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },
}));


if (typeof window !== 'undefined') {
  useAuthStore.getState().initialize();
}
