import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Megaphone, Loader2 } from 'lucide-react'
import { api, baseInstance } from '@/lib/api'
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
      console.log(err)
      toast.error('Invalid credentials or network error')
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
          <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-slate-500">Enter your credentials to access your account</p>
        </div>

        <Card className="border-slate-200 dark:border-slate-800 shadow-xl shadow-blue-900/5">
          <form onSubmit={handleLogin}>
            <CardHeader>
              <CardTitle>Login</CardTitle>
              <CardDescription>
                Sign in to manage your WhatsBlasting campaigns
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">Forgot password?</Link>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Sign in
              </Button>
              <div className="text-sm text-center text-slate-500">
                Don't have an account?{' '}
                <Link to="/register" className="text-blue-600 hover:underline font-medium">
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
