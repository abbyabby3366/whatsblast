import { QueryClient } from '@tanstack/react-query'

// The browser-side QueryClient, kept so non-React code (e.g. the API client's
// forced-logout path) can wipe cached data belonging to the previous user.
let browserQueryClient: QueryClient | null = null

export function getContext() {
  const queryClient = new QueryClient()

  if (typeof window !== 'undefined') {
    browserQueryClient = queryClient
  }

  return {
    queryClient,
  }
}

/** Drop every cached query/mutation (call on logout / account switch). */
export function clearQueryCache() {
  browserQueryClient?.clear()
}
