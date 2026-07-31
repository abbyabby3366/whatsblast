import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { safeText } from '@/lib/utils'
import { Users, Megaphone, CheckCircle2, Clock, Loader2, ChevronRight, AlertCircle } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import dayjs from 'dayjs'

export const Route = createFileRoute('/merchant/')({
  ssr: false,
  component: MerchantDashboard,
})

interface DashboardStats {
  totalCustomers: number
  totalCampaigns: number
  completedCampaigns: number
  scheduledCampaigns: number
  chartData: Array<{
    name: string
    customers: number
    messages: number
  }>
  recentCampaigns: Array<any>
}

function MerchantDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['merchant-dashboard-stats'],
    queryFn: () => api.get('merchant/dashboard-stats').json<DashboardStats>(),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  const {
    totalCustomers = 0,
    totalCampaigns = 0,
    completedCampaigns = 0,
    scheduledCampaigns = 0,
    chartData = [],
    recentCampaigns = [],
  } = stats

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Here's what's happening with your WhatsBlast campaigns today.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 shadow-sm py-2 px-3.5 gap-0.5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-0">
            <CardTitle className="text-xs font-medium text-slate-700 dark:text-slate-300">Total Customers</CardTitle>
            <div className="flex items-center gap-0.5">
              <Users className="h-3.5 w-3.5 text-emerald-600" />
              <Link 
                to="/merchant/customers" 
                className="p-0.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Go to Customers"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <div className="text-xl font-bold tracking-tight">{totalCustomers}</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Total imported contacts</p>
          </CardContent>
        </Card>
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 shadow-sm py-2 px-3.5 gap-0.5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-0">
            <CardTitle className="text-xs font-medium text-slate-700 dark:text-slate-300">Total Campaigns</CardTitle>
            <div className="flex items-center gap-0.5">
              <Megaphone className="h-3.5 w-3.5 text-emerald-600" />
              <Link 
                to="/merchant/campaigns" 
                className="p-0.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Go to Campaigns"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <div className="text-xl font-bold tracking-tight">{totalCampaigns}</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Lifetime campaigns created</p>
          </CardContent>
        </Card>
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 shadow-sm py-2 px-3.5 gap-0.5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-0">
            <CardTitle className="text-xs font-medium text-slate-700 dark:text-slate-300">Completed Campaigns</CardTitle>
            <div className="flex items-center gap-0.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
              <Link 
                to="/merchant/campaigns" 
                className="p-0.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Go to Campaigns"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <div className="text-xl font-bold tracking-tight">{completedCampaigns}</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Successfully sent campaigns</p>
          </CardContent>
        </Card>
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 shadow-sm py-2 px-3.5 gap-0.5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-0">
            <CardTitle className="text-xs font-medium text-slate-700 dark:text-slate-300">Scheduled / Running Campaigns</CardTitle>
            <div className="flex items-center gap-0.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <Link 
                to="/merchant/campaigns" 
                className="p-0.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Go to Campaigns"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <div className="text-xl font-bold tracking-tight">{scheduledCampaigns}</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Active in queue</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 py-3.5 gap-2.5">
          <CardHeader className="px-4 pb-0">
            <CardTitle>Activity Overview</CardTitle>
            <CardDescription>Customer acquisition and message volume over the past 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pl-2">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend wrapperStyle={{ paddingTop: '12px' }} />
                  <Line type="monotone" dataKey="messages" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Messages" />
                  <Line type="monotone" dataKey="customers" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Customers" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 py-3.5 gap-2.5">
          <CardHeader className="px-4 pb-0">
            <CardTitle>Recent Campaigns</CardTitle>
            <CardDescription>Your most recently created blasts.</CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <div className="space-y-3">
              {recentCampaigns.map((campaign: any) => {
                const cStatus = (campaign.status || 'draft').toLowerCase()
                const stats = campaign.stats || {}
                const totalRecipients = stats.total || campaign.recipient_phones?.length || campaign.contacts?.length || campaign.recipients?.length || 0
                const sentCount = stats.sent !== undefined ? stats.sent : (campaign.current_index || 0)
                const actualSent = cStatus === 'completed' && sentCount === 0 ? totalRecipients : sentCount

                return (
                  <div key={campaign.id} className="flex items-center">
                    <div className="ml-4 space-y-1">
                      <p className="text-sm font-medium leading-none">{campaign.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {actualSent}/{totalRecipients} sent • {dayjs(campaign.created_at || campaign.createdAt).format('MMM D, YYYY')}
                      </p>
                      {campaign.error_message && (cStatus === 'paused' || cStatus === 'failed') && (
                        <Link
                          to="/merchant/whatsapp-sessions"
                          className="text-xs text-rose-600 dark:text-rose-400 font-medium truncate max-w-[200px] hover:underline cursor-pointer flex items-center gap-1 mt-0.5"
                          title="Click to redirect to WhatsApp Sessions page"
                        >
                          <AlertCircle className="h-3 w-3 shrink-0 text-rose-500" />
                          <span className="truncate">{safeText(campaign.error_message)}</span>
                        </Link>
                      )}
                    </div>
                    <div className="ml-auto font-medium">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border
                        ${cStatus === 'completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 font-bold' : 
                          cStatus === 'scheduled' ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' : 
                          cStatus === 'running' ? 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800' :
                          cStatus === 'paused' ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800' :
                          cStatus === 'failed' ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800' :
                          'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'}`}>
                        {cStatus.toUpperCase()}
                      </span>
                    </div>
                  </div>
                )
              })}
              {recentCampaigns.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">No campaigns yet. Go create one!</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
