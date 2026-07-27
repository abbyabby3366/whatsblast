import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import { Toaster } from '../components/ui/sonner'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'WhatsBlast',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        type: 'image/png',
        href: '/futuristic-whatsapp-logo.png',
      },
      {
        rel: 'shortcut icon',
        href: '/futuristic-whatsapp-logo.png',
      },
      {
        rel: 'apple-touch-icon',
        href: '/futuristic-whatsapp-logo.png',
      },
      {
        rel: 'manifest',
        href: '/manifest.json',
      },
    ],
  }),
  notFoundComponent: NotFound,
  errorComponent: RootErrorComponent,
  shellComponent: RootDocument,
})

function RootErrorComponent({ error, reset }: { error: any; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-white text-center">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto">
          ⚠️
        </div>
        <h1 className="text-xl font-bold text-slate-100">Something went wrong</h1>
        <p className="text-xs text-slate-400 font-mono bg-slate-950/80 p-3 rounded-lg text-left break-words overflow-auto max-h-32 border border-slate-800">
          {error?.message || String(error)}
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-emerald-600 rounded-lg text-xs font-semibold hover:bg-emerald-500 transition-all text-white"
          >
            Try Again
          </button>
          <a
            href="/"
            className="px-4 py-2 bg-slate-800 rounded-lg text-xs font-semibold hover:bg-slate-700 transition-all text-slate-200 border border-slate-700"
          >
            Back to Home
          </a>
        </div>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950 text-white text-center">
      <h1 className="text-4xl font-bold mb-2">404 - Page Not Found</h1>
      <p className="text-slate-400 mb-4">The requested page could not be found.</p>
      <a href="/login" className="px-4 py-2 bg-emerald-600 rounded-lg font-medium hover:bg-emerald-700 text-white transition-all">
        Go to Login
      </a>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Toaster position="bottom-right" closeButton richColors />
        <Scripts />
      </body>
    </html>
  )
}
