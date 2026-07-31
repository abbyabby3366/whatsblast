import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'
import { baseInstance, parseApiError } from '@/lib/api'
import { useAuthStore } from '@/store/auth/useAuthStore'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const token = useAuthStore(s => s.access_token)
  const setTokens = useAuthStore(s => s.setTokens)

  // Redirect to dashboard if already authenticated
  if (token) {
    navigate({ to: '/merchant', replace: true })
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber || !password || !confirmPassword) {
      toast.error('Please fill in all fields')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    try {
      setIsLoading(true)
      const normalizedPhone = phoneNumber.trim().replace(/^\+/, '').replace(/\D/g, '')

      // Register
      await baseInstance.post('register/', {
        json: { phone_number: normalizedPhone, password, confirm_password: confirmPassword }
      })

      // Auto login after register
      const res: any = await baseInstance.post('login/', {
        json: { phone_number: normalizedPhone, password }
      }).json()

      setTokens(res.access, res.refresh)
      toast.success('Account created successfully!')
      navigate({ to: '/merchant', replace: true })
    } catch (err: any) {
      console.error(err)
      const parsed = await parseApiError(err, 'Registration failed. Check your phone number or password.')
      toast.error(parsed.message)
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
                <img src="/futuristic-whatsapp-logo.png" alt="WhatsBlast Logo" className="w-14 h-14 object-contain rounded-xl" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Create an account</CardTitle>
              <CardDescription className="text-sm text-slate-500 dark:text-slate-400">
                Enter your details to create a new account
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
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Password</Label>
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
                  <Label htmlFor="confirmPassword" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Confirm Password</Label>
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
