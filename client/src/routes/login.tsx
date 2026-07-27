import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { api, baseInstance, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/auth/useAuthStore'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const token = useAuthStore(s => s.access_token)
  const setTokens = useAuthStore(s => s.setTokens)
  const logout = useAuthStore(s => s.logout)

  useEffect(() => {
    if (token) {
      api.get('users/me/')
        .json<{ role?: string }>()
        .then((me) => {
          navigate({ to: me.role === 'admin' ? '/admin' : '/merchant', replace: true })
        })
        .catch(() => {
          logout()
        })
    }
  }, [token, logout, navigate])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber || !password) {
      toast.error('Please fill in all fields')
      return
    }
    
    try {
      setIsLoading(true)
      const res: any = await baseInstance.post('login/', { 
        json: { phone_number: phoneNumber, password } 
      }).json()
      setTokens(res.access, res.refresh)
      const me: any = await api.get('users/me/').json()
      toast.success('Successfully logged in!')
      navigate({ to: me.role === 'admin' ? '/admin' : '/merchant', replace: true })
    } catch (err: any) {
      console.error(err)
      const errorMessage = await getErrorMessage(err, 'Invalid credentials or network error')
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5 backdrop-blur-sm p-2">
          <form onSubmit={handleLogin}>
            <CardHeader className="text-center pt-6 pb-4 space-y-2">
              <div className="mx-auto w-16 h-16 p-1 bg-slate-900/90 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/20 border border-emerald-500/30 mb-1">
                <img src="/futuristic-whatsapp-logo.png" alt="WhatsBlast Logo" className="w-14 h-14 object-contain rounded-xl" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Welcome back</CardTitle>
              <CardDescription className="text-sm text-slate-500 dark:text-slate-400">
                Sign in to manage your WhatsBlast campaigns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 px-6 pt-2">
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Password</Label>
                  <Link to="/forgot-password" tabIndex={-1} className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium">Forgot password?</Link>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-11 px-3.5 bg-slate-50/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 px-6 pt-3 pb-6">
              <Button type="submit" disabled={isLoading} className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md shadow-emerald-600/20 rounded-lg transition-all">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Sign in
              </Button>
              <div className="text-sm text-center text-slate-500 dark:text-slate-400">
                Don't have an account?{' '}
                <Link to="/register" className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold">
                  Sign up
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
