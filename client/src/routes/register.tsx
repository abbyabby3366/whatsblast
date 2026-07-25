import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Megaphone, Loader2 } from 'lucide-react'
import { baseInstance } from '@/lib/api'
import { useAuthStore } from '@/store/auth/useAuthStore'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [otpSentTo, setOtpSentTo] = useState('')
  const [otpCooldown, setOtpCooldown] = useState(0)
  
  const token = useAuthStore(s => s.access_token)
  const setTokens = useAuthStore(s => s.setTokens)

  useEffect(() => {
    if (otpCooldown <= 0) return
    const timer = window.setInterval(() => {
      setOtpCooldown(value => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [otpCooldown])

  // Redirect to dashboard if already authenticated
  if (token) {
    navigate({ to: '/merchant', replace: true })
  }

  const handleSendOtp = async () => {
    if (!phoneNumber) {
      toast.error('Please enter your phone number first')
      return
    }

    try {
      setIsSendingOtp(true)
      const normalizedPhone = phoneNumber.trim().replace(/^\+/, '').replace(/\D/g, '')
      const res: any = await baseInstance.post('register/send-otp/', {
        json: { phone_number: normalizedPhone },
      }).json()
      setPhoneNumber(normalizedPhone)
      setOtp('')
      setOtpSentTo(normalizedPhone)
      setOtpCooldown(120)
      toast.success(res.detail ?? 'OTP has been sent to your WhatsApp')
    } catch (err: any) {
      console.error(err)
      let message = 'Unable to send OTP. Please try again.'
      try {
        const body = await err.response?.json()
        const retryAfter = Number(body?.retry_after_seconds ?? 0)
        if (retryAfter > 0) setOtpCooldown(retryAfter)
        message = body?.phone_number?.[0] || body?.detail || body?.error || message
      } catch {}
      toast.error(message)
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber || !password || !confirmPassword || !otp) {
      toast.error('Please fill in all fields and enter the OTP')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    
    try {
      setIsLoading(true)
      // Register
      const normalizedPhone = phoneNumber.trim().replace(/^\+/, '').replace(/\D/g, '')
      if (otpSentTo && otpSentTo !== normalizedPhone) {
        toast.error('Phone number changed after sending OTP. Please send OTP again.')
        return
      }
      await baseInstance.post('register/', { 
        json: { phone_number: normalizedPhone, password, confirm_password: confirmPassword, otp: otp.trim() } 
      })
      
      // Auto login after register
      const res: any = await baseInstance.post('login/', { 
        json: { phone_number: normalizedPhone, password } 
      }).json()
      
      setTokens(res.access, res.refresh)
      toast.success('Account created successfully!')
      navigate({ to: '/merchant', replace: true })
    } catch (err: any) {
      let message = 'Registration failed. Check your OTP or phone number.'
      try {
        const body = await err.response?.json()
        message = body?.otp?.[0] || body?.phone_number?.[0] || body?.non_field_errors?.[0] || body?.detail || body?.error || message
      } catch {}
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5 backdrop-blur-sm p-2">
          <form onSubmit={handleRegister}>
            <CardHeader className="text-center pt-6 pb-4 space-y-2">
              <div className="mx-auto w-16 h-16 p-1 bg-slate-900/90 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/20 border border-emerald-500/30 mb-1">
                <img src="/futuristic-whatsapp-logo.png" alt="WhatsBlasting Logo" className="w-14 h-14 object-contain rounded-xl" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Create an account</CardTitle>
              <CardDescription className="text-sm text-slate-500 dark:text-slate-400">
                Enter your details and verify your phone number with OTP
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="phoneNumber" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Phone Number</Label>
                <div className="flex gap-2">
                  <Input 
                    id="phoneNumber" 
                    type="text" 
                    placeholder="60123456789" 
                    value={phoneNumber}
                    onChange={e => {
                      setPhoneNumber(e.target.value)
                      if (otpSentTo && e.target.value.trim().replace(/^\+/, '').replace(/\D/g, '') !== otpSentTo) {
                        setOtpSentTo('')
                      }
                    }}
                    className="h-11 px-3.5 bg-slate-50/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500"
                  />
                  <Button type="button" variant="outline" disabled={isSendingOtp || otpCooldown > 0} onClick={handleSendOtp} className="h-11 px-4 border-slate-200 dark:border-slate-800 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40">
                    {isSendingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : otpCooldown > 0 ? `Wait ${otpCooldown}s` : otpSentTo ? 'Resend OTP' : 'Send OTP'}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="otp" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">OTP Code</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  className="h-11 px-3.5 bg-slate-50/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-11 px-3.5 bg-slate-50/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Confirm Password</Label>
                <Input 
                  id="confirmPassword" 
                  type="password" 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="h-11 px-3.5 bg-slate-50/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 px-6 pt-3 pb-6">
              <Button type="submit" disabled={isLoading} className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md shadow-emerald-600/20 rounded-lg transition-all">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Account
              </Button>
              <div className="text-sm text-center text-slate-500 dark:text-slate-400">
                Already have an account?{' '}
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
