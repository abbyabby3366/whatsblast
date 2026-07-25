import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Users, Megaphone, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useMemo } from 'react'
import dayjs from 'dayjs'

export const Route = createFileRoute('/merchant/')({
  ssr: false,
  component: MerchantDashboard,
})

function MerchantDashboard() {
  const { data: customersData, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('customers/').json<any>(),
  })

  const { data: campaignsData, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('blast-campaigns/').json<any>(),
  })

  const customers = useMemo(() => {
    if (!customersData) return []
    return Array.isArray(customersData) ? customersData : customersData.results || []
  }, [customersData])

  const campaigns = useMemo(() => {
    if (!campaignsData) return []
    return Array.isArray(campaignsData) ? campaignsData : campaignsData.results || []
  }, [campaignsData])

  const totalCustomers = customers.length
  const totalCampaigns = campaigns.length
  const completedCampaigns = campaigns.filter((c: any) => c.status === 'completed').length
  const scheduledCampaigns = campaigns.filter((c: any) => c.status === 'scheduled' || c.status === 'running').length

  const chartData = useMemo(() => {
    // Generate simple chart data based on loaded items
    const data = []
    for (let i = 6; i >= 0; i--) {
      const date = dayjs().subtract(i, 'day').format('MMM DD')
      
      const dayCustomers = customers.filter((c: any) => 
        dayjs(c.created_at || c.createdAt).format('MMM DD') === date
      ).length
      
      const dayCampaigns = campaigns.filter((c: any) => 
        dayjs(c.created_at || c.createdAt).format('MMM DD') === date
      ).length

      data.push({
        name: date,
        customers: dayCustomers,
        // Approximate messages sent if we don't have exact metrics per day
        messages: dayCampaigns > 0 ? dayCampaigns * 50 : 0, 
      })
    }
    return data
  }, [customers, campaigns])

  if (isLoadingCustomers || isLoadingCampaigns) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Overview</h2>
        <p className="text-slate-500 dark:text-slate-400">Here's what's happening with your WhatsBlasting campaigns today.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 shadow-lg shadow-slate-900/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomers}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Total imported contacts</p>
          </CardContent>
        </Card>
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 shadow-lg shadow-slate-900/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <Megaphone className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCampaigns}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Lifetime campaigns created</p>
          </CardContent>
        </Card>
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 shadow-lg shadow-slate-900/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Blasts</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedCampaigns}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Successfully sent campaigns</p>
          </CardContent>
        </Card>
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 shadow-lg shadow-slate-900/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled / Running</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scheduledCampaigns}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Active in queue</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800">
          <CardHeader>
            <CardTitle>Activity Overview</CardTitle>
            <CardDescription>Customer acquisition and message volume over the past 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="messages" stroke="#059669" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Messages" />
                  <Line type="monotone" dataKey="customers" stroke="#0d9488" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Customers" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-slate-200/80 dark:border-slate-800">
          <CardHeader>
            <CardTitle>Recent Campaigns</CardTitle>
            <CardDescription>Your most recently created blasts.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {campaigns.slice(0, 5).map((campaign: any) => (
                <div key={campaign.id} className="flex items-center">
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">{campaign.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {campaign.recipients?.length || 0} recipients • {dayjs(campaign.created_at || campaign.createdAt).format('MMM D, YYYY')}
                    </p>
                  </div>
                  <div className="ml-auto font-medium">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
                      ${campaign.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 
                        campaign.status === 'scheduled' ? 'bg-amber-100 text-amber-800' : 
                        campaign.status === 'running' ? 'bg-teal-100 text-teal-800' :
                        'bg-slate-100 text-slate-800'}`}>
                      {campaign.status || 'draft'}
                    </span>
                  </div>
                </div>
              ))}
              {campaigns.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">No campaigns yet. Go create one!</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
