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

export async function parseApiError(
  err: any,
  fallbackMessage: string = 'An unexpected error occurred. Please try again.'
): Promise<{ message: string; data?: any }> {
  if (!err) {
    return { message: fallbackMessage };
  }

  if (typeof err === 'string') {
    return { message: err };
  }

  let body: any = null;

  if (err?.response) {
    try {
      const response: Response = err.response;
      if (typeof response.clone === 'function') {
        const cloned = response.clone();
        body = await cloned.json().catch(async () => {
          const text = await cloned.text().catch(() => null);
          return text ? { error: text } : null;
        });
      } else if (typeof response.json === 'function') {
        body = await response.json().catch(() => null);
      } else if (err.response.data) {
        body = err.response.data;
      }
    } catch (e) {
      console.warn('Error reading error response body:', e);
    }
  }

  if (!body) {
    if (err.data && typeof err.data === 'object') {
      body = err.data;
    } else if (typeof err === 'object' && !err.message && !err.response) {
      body = err;
    }
  }

  if (body) {
    if (typeof body === 'string') {
      return { message: body, data: body };
    }

    if (typeof body === 'object') {
      if (typeof body.error === 'string' && body.error.trim()) {
        return { message: body.error, data: body };
      }
      if (typeof body.detail === 'string' && body.detail.trim()) {
        return { message: body.detail, data: body };
      }
      if (typeof body.message === 'string' && body.message.trim()) {
        return { message: body.message, data: body };
      }

      const keys = Object.keys(body);
      for (const key of keys) {
        const val = body[key];
        if (typeof val === 'string' && val.trim()) {
          return { message: `${key}: ${val}`, data: body };
        }
        if (Array.isArray(val) && val.length > 0) {
          const first = val[0];
          if (typeof first === 'string' && first.trim()) {
            return { message: first, data: body };
          }
        }
      }
    }
  }

  if (typeof err.message === 'string' && err.message.trim()) {
    const msg = err.message.trim();
    if (!msg.includes('HTTPError') && !msg.includes('Failed to fetch') && !msg.includes('NetworkError')) {
      return { message: msg, data: body };
    }
  }

  return { message: fallbackMessage, data: body };
}

export async function getErrorMessage(
  err: any,
  fallbackMessage: string = 'An unexpected error occurred. Please try again.'
): Promise<string> {
  const result = await parseApiError(err, fallbackMessage);
  return result.message;
}

