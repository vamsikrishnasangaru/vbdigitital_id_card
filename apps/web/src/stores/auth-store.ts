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
  logout: () => void;
  setUser: (user: User) => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('loginTimestamp', String(Date.now()));
    set({ user, isAuthenticated: true, isLoading: false });
    // Upload anything queued while the previous session was expired/offline.
    void import('@/lib/sync-engine').then(({ syncEngine }) => syncEngine.flushQueue());
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('loginTimestamp');
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
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            localStorage.removeItem('loginTimestamp');
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
