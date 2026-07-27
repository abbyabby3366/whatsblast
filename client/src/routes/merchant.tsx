import { Outlet, createFileRoute, Link, useNavigate, useLocation } from '@tanstack/react-router'
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
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { LayoutDashboard, Users, Megaphone, LogOut, MessageSquare, Smartphone, User, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth/useAuthStore'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { APP_VERSION } from '@/lib/version'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  const location = useLocation()
  const [isLogoutOpen, setIsLogoutOpen] = useState(false)
  const [isCheckingRole, setIsCheckingRole] = useState(true)

  const getPageHeader = () => {
    if (location.pathname.startsWith('/merchant/customers')) {
      return 'Customers'
    }
    if (location.pathname.startsWith('/merchant/campaigns')) {
      return 'Campaigns'
    }
    if (location.pathname.startsWith('/merchant/messages')) {
      return 'Messages'
    }
    if (location.pathname.startsWith('/merchant/whatsapp-sessions')) {
      return 'WhatsApp Sessions'
    }
    if (location.pathname.startsWith('/merchant/profile')) {
      return 'Profile Settings'
    }
    return 'Overview'
  }

  const pageTitle = getPageHeader()

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
          <SidebarHeader className="h-14 flex items-center px-4 border-b border-slate-200 dark:border-slate-800">
            <Link to="/merchant" className="flex items-center gap-2.5 font-bold text-lg text-emerald-600 dark:text-emerald-400 hover:opacity-80 transition-opacity">
              <img src="/futuristic-whatsapp-logo.png" alt="WhatsBlast Logo" className="w-7 h-7 object-contain rounded-lg shadow-sm" />
              <span className="tracking-tight text-slate-900 dark:text-white">WhatsBlast {APP_VERSION}</span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup className="px-3 py-2">
              <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1">
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" asChild>
                      <Link to="/merchant" activeProps={{ className: 'bg-emerald-50 dark:bg-emerald-950/50 font-semibold text-emerald-600 dark:text-emerald-400' }} activeOptions={{ exact: true }} className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <LayoutDashboard className="w-4 h-4 shrink-0" />
                        <span>Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" asChild>
                      <Link to="/merchant/customers" activeProps={{ className: 'bg-emerald-50 dark:bg-emerald-950/50 font-semibold text-emerald-600 dark:text-emerald-400' }} className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <Users className="w-4 h-4 shrink-0" />
                        <span>Customers</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" asChild>
                      <Link to="/merchant/campaigns" activeProps={{ className: 'bg-emerald-50 dark:bg-emerald-950/50 font-semibold text-emerald-600 dark:text-emerald-400' }} className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <Megaphone className="w-4 h-4 shrink-0" />
                        <span>Campaigns</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" asChild>
                      <Link to="/merchant/messages" activeProps={{ className: 'bg-emerald-50 dark:bg-emerald-950/50 font-semibold text-emerald-600 dark:text-emerald-400' }} className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <MessageSquare className="w-4 h-4 shrink-0" />
                        <span>Messages</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" asChild>
                      <Link to="/merchant/whatsapp-sessions" activeProps={{ className: 'bg-emerald-50 dark:bg-emerald-950/50 font-semibold text-emerald-600 dark:text-emerald-400' }} className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <Smartphone className="w-4 h-4 shrink-0" />
                        <span>WhatsApp Sessions</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 sm:px-6 justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <SidebarTrigger className="mr-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" />
              <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{pageTitle}</h1>
            </div>
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
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center p-0 shadow-md shadow-emerald-600/20">
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
          <div className="flex-1 overflow-auto p-3.5 sm:p-4">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
