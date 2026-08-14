import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/merchant/workflows')({
  component: () => <Outlet />,
})
