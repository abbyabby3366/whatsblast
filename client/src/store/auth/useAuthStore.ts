import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  access_token: string | null;
  refresh_token: string | null;
  setTokens: (accessToken: string | null, refreshToken: string | null) => void;
  setAccessToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      access_token: null,
      refresh_token: null,
      setTokens: (accessToken, refreshToken) => set({ access_token: accessToken, refresh_token: refreshToken }),
      setAccessToken: (token) => set({ access_token: token }),
      logout: () => set({ access_token: null, refresh_token: null }),
    }),
    {
      name: 'whatsblasting-auth',
    }
  )
);
