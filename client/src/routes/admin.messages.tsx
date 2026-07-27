import { createFileRoute } from '@tanstack/react-router'
import { MessagesView } from '@/components/messages/MessagesView'

export const Route = createFileRoute('/admin/messages')({
  ssr: false,
  component: AdminMessagesPage,
})

function AdminMessagesPage() {
  return <MessagesView isAdmin={true} />
}
