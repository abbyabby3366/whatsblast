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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20 mb-4">
            <Megaphone className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Create an account</h1>
          <p className="text-slate-500">Get started with WhatsBlasting today</p>
        </div>

        <Card className="border-slate-200 dark:border-slate-800 shadow-xl shadow-blue-900/5">
          <form onSubmit={handleRegister}>
            <CardHeader>
              <CardTitle>Sign Up</CardTitle>
              <CardDescription>
                Enter your details and verify your phone number with OTP
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
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
                    className="bg-slate-50 dark:bg-slate-900"
                  />
                  <Button type="button" variant="outline" disabled={isSendingOtp || otpCooldown > 0} onClick={handleSendOtp}>
                    {isSendingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : otpCooldown > 0 ? `Wait ${otpCooldown}s` : otpSentTo ? 'Resend OTP' : 'Send OTP'}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="otp">OTP</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input 
                  id="confirmPassword" 
                  type="password" 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Account
              </Button>
              <div className="text-sm text-center text-slate-500">
                Already have an account?{' '}
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
