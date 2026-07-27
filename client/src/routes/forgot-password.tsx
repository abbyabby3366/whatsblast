import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Megaphone } from 'lucide-react'
import { baseInstance, parseApiError } from '@/lib/api'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [otpCooldown, setOtpCooldown] = useState(0)

  useEffect(() => {
    if (otpCooldown <= 0) return
    const timer = window.setInterval(() => {
      setOtpCooldown(value => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [otpCooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber) {
      toast.error('Please enter your phone number')
      return
    }

    try {
      setIsLoading(true)
      const normalizedPhone = phoneNumber.trim().replace(/^\+/, '').replace(/\D/g, '')
      const res: any = await baseInstance.post('forgot-password/', {
        json: { phone_number: normalizedPhone },
      }).json()
      setPhoneNumber(normalizedPhone)
      setOtpCooldown(120)
      toast.success(res.detail ?? 'If the account exists, an OTP has been sent.')
      navigate({ to: '/reset-password', search: { phone_number: normalizedPhone } as never })
    } catch (err: any) {
      console.error(err)
      const parsed = await parseApiError(err, 'Unable to request password reset. Please try again.')
      const retryAfter = Number(parsed.data?.retry_after_seconds ?? 0)
      if (retryAfter > 0) setOtpCooldown(retryAfter)
      toast.error(parsed.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5 backdrop-blur-sm p-2">
          <form onSubmit={handleSubmit}>
            <CardHeader className="text-center pt-6 pb-4 space-y-2">
              <div className="mx-auto w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/25 mb-1">
                <Megaphone className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Forgot password?</CardTitle>
              <CardDescription className="text-sm text-slate-500 dark:text-slate-400">
                Enter your WhatsApp phone number to receive a verification OTP
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="phoneNumber" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="text"
                  placeholder="60123456789"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  className="h-11 px-3.5 bg-slate-50/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 px-6 pt-3 pb-6">
              <Button type="submit" disabled={isLoading || otpCooldown > 0} className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md shadow-emerald-600/20 rounded-lg transition-all">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {otpCooldown > 0 ? `Wait ${otpCooldown}s` : 'Send OTP'}
              </Button>
              <div className="text-sm text-center text-slate-500 dark:text-slate-400">
                Remember your password?{' '}
                <Link to="/login" className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold">
                  Sign in
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
