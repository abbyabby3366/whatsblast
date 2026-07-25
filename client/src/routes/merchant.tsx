import { Outlet, createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { LayoutDashboard, Users, Megaphone, LogOut, MessageSquare, Smartphone, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth/useAuthStore'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export const Route = createFileRoute('/merchant')({
  ssr: false,
  component: MerchantLayout,
})

function MerchantLayout() {
  const token = useAuthStore(s => s.access_token)
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()
  const [isLogoutOpen, setIsLogoutOpen] = useState(false)
  const [isCheckingRole, setIsCheckingRole] = useState(true)

  useEffect(() => {
    if (!token) {
      navigate({ to: '/login', replace: true })
      setIsCheckingRole(false)
      return
    }

    let isMounted = true

    api.get('users/me/')
      .json<{ role?: string }>()
      .then((me) => {
        if (!isMounted) return

        if (me.role === 'admin') {
          navigate({ to: '/admin', replace: true })
          return
        }

        setIsCheckingRole(false)
      })
      .catch(() => {
        if (!isMounted) return

        logout()
        navigate({ to: '/login', replace: true })
      })

    return () => {
      isMounted = false
    }
  }, [token, logout, navigate])

  if (!token || isCheckingRole) {
    return null
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-950">
        <Sidebar className="border-r border-slate-200 dark:border-slate-800">
          <SidebarHeader className="h-16 flex items-center px-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 font-bold text-lg text-primary">
              <Megaphone className="w-6 h-6 text-blue-600" />
              <span>WhatsBlasting</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/merchant" activeProps={{ className: 'bg-slate-100 dark:bg-slate-800 font-semibold text-blue-600' }} activeOptions={{ exact: true }}>
                        <LayoutDashboard className="w-4 h-4 mr-2" />
                        Dashboard
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/merchant/customers" activeProps={{ className: 'bg-slate-100 dark:bg-slate-800 font-semibold text-blue-600' }}>
                        <Users className="w-4 h-4 mr-2" />
                        Customers
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/merchant/campaigns" activeProps={{ className: 'bg-slate-100 dark:bg-slate-800 font-semibold text-blue-600' }}>
                        <Megaphone className="w-4 h-4 mr-2" />
                        Campaigns
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/merchant/messages" activeProps={{ className: 'bg-slate-100 dark:bg-slate-800 font-semibold text-blue-600' }}>
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Messages
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/merchant/whatsapp-sessions" activeProps={{ className: 'bg-slate-100 dark:bg-slate-800 font-semibold text-blue-600' }}>
                        <Smartphone className="w-4 h-4 mr-2" />
                        WhatsApp Sessions
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-6 justify-between shrink-0">
            <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Merchant Portal</h1>
            <div className="flex items-center gap-4">
              <Dialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Are you sure?</DialogTitle>
                    <DialogDescription>
                      You are about to logout from your account.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsLogoutOpen(false)}>Cancel</Button>
                    <Button 
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => {
                        setIsLogoutOpen(false)
                        logout()
                        navigate({ to: '/login' })
                      }}
                    >
                      Logout
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center p-0">
                    <span className="text-sm font-medium">M</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link to="/merchant/profile" className="flex items-center cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="text-red-600 focus:bg-red-50 focus:text-red-600 cursor-pointer"
                    onClick={() => setIsLogoutOpen(true)}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <div className="flex-1 overflow-auto p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
