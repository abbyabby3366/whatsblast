import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Megaphone } from 'lucide-react'
import { baseInstance } from '@/lib/api'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    uid: typeof search.uid === 'string' ? search.uid : '',
    token: typeof search.token === 'string' ? search.token : '',
    phone_number: typeof search.phone_number === 'string' ? search.phone_number : '',
  }),
  component: ResetPasswordPage,
})

function normalizePhoneNumber(value: string) {
  let phone = String(value || '').trim()
  try {
    phone = decodeURIComponent(phone)
  } catch {}
  if ((phone.startsWith('"') && phone.endsWith('"')) || (phone.startsWith("'") && phone.endsWith("'"))) {
    phone = phone.slice(1, -1)
  }
  return phone.trim().replace(/^\+/, '').replace(/\D/g, '')
}

function ResetPasswordPage() {
  const navigate = useNavigate()
  const { uid, token, phone_number } = Route.useSearch()
  const [phoneNumber] = useState(() => normalizePhoneNumber(phone_number))
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const usingLink = Boolean(uid && token)
    if (!usingLink && (!phoneNumber || !otp)) {
      toast.error('Please enter your phone number and OTP')
      return
    }
    if (!password || !confirmPassword) {
      toast.error('Please fill in all fields')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    try {
      setIsLoading(true)
      const payload = usingLink
        ? { uid, token, password, confirm_password: confirmPassword }
        : { phone_number: phoneNumber, otp, password, confirm_password: confirmPassword }
      const res: any = await baseInstance.post('reset-password/', {
        json: payload,
      }).json()
      toast.success(res.detail ?? 'Password has been reset successfully.')
      navigate({ to: '/login', replace: true })
    } catch (err) {
      console.error(err)
      toast.error('Unable to reset password. The OTP may be invalid or expired.')
    } finally {
      setIsLoading(false)
    }
  }

  const usingLink = Boolean(uid && token)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20 mb-4">
            <Megaphone className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Create new password</h1>
          <p className="text-slate-500">Choose a strong password for your account</p>
        </div>

        <Card className="border-slate-200 dark:border-slate-800 shadow-xl shadow-blue-900/5">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Reset Password</CardTitle>
              <CardDescription>
                {usingLink ? 'Enter and confirm your new password' : 'Enter the OTP sent to your WhatsApp'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!usingLink ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber">Phone Number</Label>
                    <Input
                      id="phoneNumber"
                      type="text"
                      placeholder="60123456789"
                      value={phoneNumber}
                      disabled
                      className="bg-slate-100 text-slate-600 disabled:opacity-100 disabled:cursor-not-allowed dark:bg-slate-900 dark:text-slate-300"
                    />
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
                </>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
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
                Reset password
              </Button>
              <div className="text-sm text-center text-slate-500">
                Need a new OTP?{' '}
                <Link to="/forgot-password" className="text-blue-600 hover:underline font-medium">
                  Request reset
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
