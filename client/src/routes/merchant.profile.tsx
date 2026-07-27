import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, User } from 'lucide-react'

import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'

export const Route = createFileRoute('/merchant/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  const queryClient = useQueryClient()
  
  const [minInterval, setMinInterval] = useState('10')
  const [maxInterval, setMaxInterval] = useState('15')

  const { data: userProfile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get('users/me/').json<any>(),
  })

  useEffect(() => {
    if (userProfile?.min_interval_minutes) {
      const parts = userProfile.min_interval_minutes.split('-')
      if (parts.length === 2) {
        setMinInterval(parts[0])
        setMaxInterval(parts[1])
      }
    }
  }, [userProfile])

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => api.patch('users/me/', { json: data }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Profile updated successfully')
    },
    onError: async (err) => {
      toast.error(await getErrorMessage(err, 'Failed to update profile'))
    }
  })

  const handleSave = () => {
    const min = parseInt(minInterval)
    const max = parseInt(maxInterval)

    if (isNaN(min) || isNaN(max)) {
      toast.error('Intervals must be numbers')
      return
    }

    if (max < min) {
      toast.error('Max interval cannot be lower than min interval')
      return
    }

    updateProfileMutation.mutate({
      min_interval_minutes: `${min}-${max}`
    })
  }

  const initialParts = userProfile?.min_interval_minutes?.split('-') || []
  const initialMin = initialParts[0] ?? '10'
  const initialMax = initialParts[1] ?? '15'
  const isUnchanged = minInterval === initialMin && maxInterval === initialMax

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <p className="text-xs text-slate-500">
          Manage your personal information and preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-emerald-600" />
            Account Information
          </CardTitle>
          <CardDescription className="text-xs">
            Update your sending interval configurations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Login Phone Number</Label>
            <Input disabled value={userProfile?.phone_number || ''} className="bg-slate-50 text-slate-500" />
            <p className="text-xs text-slate-500">Phone number cannot be changed.</p>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div>
              <h4 className="text-sm font-medium mb-1">Message Interval</h4>
              <p className="text-xs text-slate-500 mb-4">
                Set the minimum and maximum delay (in minutes) between each WhatsApp message sent in your campaigns to prevent ban.
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="min">Min (Minutes)</Label>
                <Input 
                  id="min"
                  type="number" 
                  min="0"
                  value={minInterval} 
                  onChange={(e) => setMinInterval(e.target.value)} 
                />
              </div>
              <div className="flex items-center pt-8 font-bold text-slate-400">
                —
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="max">Max (Minutes)</Label>
                <Input 
                  id="max"
                  type="number" 
                  min="0"
                  value={maxInterval} 
                  onChange={(e) => setMaxInterval(e.target.value)} 
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-6">
          <Button 
            onClick={handleSave} 
            disabled={isUnchanged || updateProfileMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {updateProfileMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
