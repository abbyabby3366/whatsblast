import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  // Redirect to login by default
  return <Navigate to="/login" replace />
}
