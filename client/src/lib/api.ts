import ky from 'ky';
import { env } from '@/env';
import { useAuthStore } from '@/store/auth/useAuthStore';

export const baseInstance = ky.create({
  baseUrl: env.VITE_BACKEND_URL,
  timeout: 600000,
});

export const retryInstance = baseInstance.extend((parent) => ({
  ...parent,
  retry: {
    statusCodes: [500, 502, 503, 504],
    limit: 3,
  },
  timeout: 600000,
  baseUrl: `${parent.baseUrl}`,
}));

let refreshPromise: Promise<string | null> | null = null;

function redirectToLogin() {
  useAuthStore.getState().logout();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

async function refreshAccessToken() {
  const refreshToken = useAuthStore.getState().refresh_token;

  if (!refreshToken) {
    return null;
  }

  if (!refreshPromise) {
    refreshPromise = baseInstance
      .post('token/refresh/', { json: { refresh: refreshToken } })
      .json<{ access: string; refresh?: string }>()
      .then((tokens) => {
        useAuthStore.getState().setTokens(tokens.access, tokens.refresh ?? refreshToken);
        return tokens.access;
      })
      .catch(() => {
        redirectToLogin();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

const authedInstance = baseInstance.extend((parent) => ({
  ...parent,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const accessToken = useAuthStore.getState().access_token;
        if (accessToken) {
          request.headers.set('Authorization', `Bearer ${accessToken}`);
        }
      },
    ],
    afterResponse: [
      async ({ request, response, retryCount }) => {
        if (response.status !== 401 || retryCount > 0) {
          return response;
        }

        const newAccessToken = await refreshAccessToken();
        if (!newAccessToken) {
          return response;
        }

        const headers = new Headers(request.headers);
        headers.set('Authorization', `Bearer ${newAccessToken}`);

        return ky.retry({
          request: new Request(request, { headers }),
          code: 'TOKEN_REFRESHED',
        });
      },
    ],
  },
  timeout: 600000,
}));

/**
 * @deprecated Use `authedInstance` for authenticated requests, `baseInstance`
 * for public endpoints, or `retryInstance` for fault-tolerant calls instead.
 */
export const api = authedInstance;
