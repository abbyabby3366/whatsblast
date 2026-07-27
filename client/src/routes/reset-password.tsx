import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Megaphone, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'
import { baseInstance, getErrorMessage } from '@/lib/api'

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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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
      const msg = await getErrorMessage(err, 'Unable to reset password. The OTP may be invalid or expired.')
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const usingLink = Boolean(uid && token)

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5 backdrop-blur-sm p-2">
          <form onSubmit={handleSubmit}>
            <CardHeader className="text-center pt-6 pb-4 space-y-2">
              <div className="mx-auto w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/25 mb-1">
                <Megaphone className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Create new password</CardTitle>
              <CardDescription className="text-sm text-slate-500 dark:text-slate-400">
                {usingLink ? 'Enter and confirm your new password' : 'Enter the OTP sent to your WhatsApp and choose a new password'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pt-2">
              {!usingLink ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="phoneNumber" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Phone Number</Label>
                    <Input
                      id="phoneNumber"
                      type="text"
                      placeholder="60123456789"
                      value={phoneNumber}
                      disabled
                      className="h-11 px-3.5 bg-slate-100/80 text-slate-600 disabled:opacity-100 disabled:cursor-not-allowed dark:bg-slate-900 dark:text-slate-300"
                    />
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
                </>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="h-11 pl-3.5 pr-10 bg-slate-50/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 focus:outline-none select-none"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="confirmPassword" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Confirm New Password</Label>
                  {confirmPassword && (
                    password === confirmPassword ? (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Passwords match
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-rose-500 dark:text-rose-400 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Passwords do not match
                      </span>
                    )
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className={`h-11 pl-3.5 pr-10 bg-slate-50/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500 ${
                      confirmPassword ? (password === confirmPassword ? 'border-emerald-500 focus:ring-emerald-500' : 'border-rose-500 focus:ring-rose-500') : ''
                    }`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 focus:outline-none select-none"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 px-6 pt-3 pb-6">
              <Button type="submit" disabled={isLoading} className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md shadow-emerald-600/20 rounded-lg transition-all">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Reset password
              </Button>
              <div className="text-sm text-center text-slate-500 dark:text-slate-400">
                Need a new OTP?{' '}
                <Link to="/forgot-password" className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold">
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
