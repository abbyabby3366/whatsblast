import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Megaphone,
  Plus,
  LayoutGrid,
  List,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { api, getErrorMessage } from '@/lib/api'
import { WhatsAppPhonePreviewModal } from '@/components/campaigns/WhatsAppPhonePreviewModal'
import { CustomerListModal } from '@/components/campaigns/CustomerListModal'
import { Button } from '@/components/ui/button'

import { MerchantCampaignViews } from '@/components/merchant-campaigns-index/components/MerchantCampaignViews'

export const Route = createFileRoute('/merchant/campaigns/')({
  component: CampaignsPage,
})

function CampaignsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedPreviewCampaign, setSelectedPreviewCampaign] = useState<any>(null)
  const [selectedCustomerListCampaign, setSelectedCustomerListCampaign] = useState<any>(null)
  const [actionId, setActionId] = useState<string | number | undefined>(undefined)

  const { data: campaignsResponse, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('blast-campaigns/').json<any>(),
  })

  const campaigns = Array.isArray(campaignsResponse)
    ? campaignsResponse
    : campaignsResponse?.results || []

  const pauseCampaignMutation = useMutation({
    mutationFn: (id: string | number) => {
      setActionId(id)
      return api.post(`blast-campaigns/${id}/pause/`).json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign paused.')
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to pause campaign.'))
    },
    onSettled: () => setActionId(undefined),
  })

  const resumeCampaignMutation = useMutation({
    mutationFn: (id: string | number) => {
      setActionId(id)
      return api.post(`blast-campaigns/${id}/resume/`).json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign resumed.')
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to resume campaign.'))
    },
    onSettled: () => setActionId(undefined),
  })

  const retryFailedMutation = useMutation({
    mutationFn: (id: string | number) => {
      setActionId(id)
      return api.post(`blast-campaigns/${id}/retry-failed/`).json<any>()
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-logs'] })
      toast.success(data?.message || 'Retrying failed campaign messages...')
    },
    onError: async (err: any) => {
      toast.error(await getErrorMessage(err, 'Failed to retry campaign.'))
    },
    onSettled: () => setActionId(undefined),
  })

  const handleEdit = (campaign: any) => {
    navigate({ to: '/merchant/campaigns/create', search: { edit: campaign.id } })
  }

  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    const saved = localStorage.getItem('campaigns_view_mode')
    return saved === 'table' ? 'table' : 'card'
  })

  const handleViewModeChange = (mode: 'card' | 'table') => {
    setViewMode(mode)
    localStorage.setItem('campaigns_view_mode', mode)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Campaigns</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleViewModeChange('card')}
              className={`h-8 w-8 p-0 ${
                viewMode === 'card'
                  ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
              title="Cards view"
              aria-label="Cards view"
            >
              <LayoutGrid className="h-4 w-4 text-emerald-600" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleViewModeChange('table')}
              className={`h-8 w-8 p-0 ${
                viewMode === 'table'
                  ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
              title="Table view"
              aria-label="Table view"
            >
              <List className="h-4 w-4 text-emerald-600" />
            </Button>
          </div>

          <Button
            onClick={() => navigate({ to: '/merchant/campaigns/create' })}
            className="bg-emerald-600 font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus className="mr-2 h-4 w-4" /> Create New Campaign
          </Button>
        </div>
      </div>

      <MerchantCampaignViews
        viewMode={viewMode}
        campaigns={campaigns}
        isLoading={isLoadingCampaigns}
        onEdit={handleEdit}
        onPause={(id) => pauseCampaignMutation.mutate(id)}
        onResume={(id) => resumeCampaignMutation.mutate(id)}
        onRetryFailed={(id) => retryFailedMutation.mutate(id)}
        onProgress={(id) => navigate({ to: '/merchant/campaigns/progress', search: { id } })}
        onPreview={(campaign) => setSelectedPreviewCampaign(campaign)}
        onCustomerList={(campaign) => setSelectedCustomerListCampaign(campaign)}
        isPausing={pauseCampaignMutation.isPending}
        isResuming={resumeCampaignMutation.isPending}
        isRetrying={retryFailedMutation.isPending}
        actionId={actionId}
      />

      {/* Preview Modal */}
      {selectedPreviewCampaign && (
        <WhatsAppPhonePreviewModal
          isOpen={Boolean(selectedPreviewCampaign)}
          onClose={() => setSelectedPreviewCampaign(null)}
          title={selectedPreviewCampaign.name}
          templates={selectedPreviewCampaign.templates || [selectedPreviewCampaign.template || { text: 'Hello' }]}
        />
      )}

      {/* Customer List Modal */}
      {selectedCustomerListCampaign && (
        <CustomerListModal
          isOpen={Boolean(selectedCustomerListCampaign)}
          onClose={() => setSelectedCustomerListCampaign(null)}
          campaignTitle={selectedCustomerListCampaign.name}
          recipients={selectedCustomerListCampaign.recipient_phones || []}
        />
      )}
    </div>
  )
}
