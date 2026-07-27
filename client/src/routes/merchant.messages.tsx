import { createFileRoute } from '@tanstack/react-router'
import { MessagesView } from '@/components/messages/MessagesView'

export const Route = createFileRoute('/merchant/messages')({
  component: MessagesPage,
})

function MessagesPage() {
  return <MessagesView isAdmin={false} />
}
