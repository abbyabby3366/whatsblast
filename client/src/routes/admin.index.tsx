import type { ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, Loader2, Megaphone, Smartphone, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

type User = { id: string; phone_number?: string; role?: string; is_active?: boolean }

function rows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && 'results' in data) return (data as { results?: T[] }).results ?? []
  return []
}

function AdminDashboard() {
  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.get('users/').json<unknown>() })
  const campaignsQuery = useQuery({ queryKey: ['admin', 'campaigns'], queryFn: () => api.get('blast-campaigns/').json<unknown>() })
  const sessionsQuery = useQuery({ queryKey: ['admin', 'sessions'], queryFn: () => api.get('whatsapp-sessions/').json<unknown>() })

  const users = rows<User>(usersQuery.data)
  const campaigns = rows<unknown>(campaignsQuery.data)
  const sessions = rows<{ is_active?: boolean }>(sessionsQuery.data)
  const isLoading = usersQuery.isLoading || campaignsQuery.isLoading || sessionsQuery.isLoading

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">System Overview</h2>
          <p className="text-slate-500">Global metrics across merchants, campaigns, and WhatsApp sessions.</p>
        </div>
        <Button asChild>
          <Link to="/admin/users">Manage Users</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Metric title="Total Users" value={users.length} note="Registered accounts" icon={<Users className="h-4 w-4 text-slate-500" />} />
        <Metric title="Merchants" value={users.filter((u) => u.role === 'merchant').length} note="Merchant accounts" icon={<Users className="h-4 w-4 text-slate-500" />} />
        <Metric title="Campaigns" value={campaigns.length} note="Blast campaigns" icon={<Megaphone className="h-4 w-4 text-slate-500" />} />
        <Metric title="Active Sessions" value={sessions.filter((s) => s.is_active !== false).length} note="WhatsApp sessions" icon={<Smartphone className="h-4 w-4 text-slate-500" />} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Recent Users</CardTitle>
          <Activity className="h-4 w-4 text-slate-500" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users.slice(0, 10).map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">{user.phone_number || `User #${user.id}`}</p>
                  <p className="text-xs text-slate-500">User ID: {user.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{user.role || 'user'}</Badge>
                  <Badge variant={user.is_active === false ? 'secondary' : 'default'}>{user.is_active === false ? 'Inactive' : 'Active'}</Badge>
                </div>
              </div>
            ))}
            {users.length === 0 ? <p className="text-sm text-slate-500">No users found.</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric(props: { title: string; value: number; note: string; icon: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{props.title}</CardTitle>
        {props.icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{props.value}</div>
        <p className="text-xs text-slate-500">{props.note}</p>
      </CardContent>
    </Card>
  )
}
