import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Megaphone } from 'lucide-react'
import { baseInstance } from '@/lib/api'

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
      let message = 'Unable to request password reset. Please try again.'
      try {
        const body = await err.response?.json()
        const retryAfter = Number(body?.retry_after_seconds ?? 0)
        if (retryAfter > 0) setOtpCooldown(retryAfter)
        message = body?.phone_number?.[0] || body?.detail || body?.error || message
      } catch {}
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20 mb-4">
            <Megaphone className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Forgot password?</h1>
          <p className="text-slate-500">Enter your phone number and we'll send an OTP to WhatsApp</p>
        </div>

        <Card className="border-slate-200 dark:border-slate-800 shadow-xl shadow-blue-900/5">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Request OTP</CardTitle>
              <CardDescription>
                Use the phone number connected to your WhatsBlasting account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="text"
                  placeholder="60123456789"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" disabled={isLoading || otpCooldown > 0} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {otpCooldown > 0 ? `Wait ${otpCooldown}s` : 'Send OTP'}
              </Button>
              <div className="text-sm text-center text-slate-500">
                Remember your password?{' '}
                <Link to="/login" className="text-blue-600 hover:underline font-medium">
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
