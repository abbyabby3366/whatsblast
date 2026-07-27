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
  shellComponent: RootDocument,
})

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
