import { Outlet, createFileRoute, Link, useNavigate, useLocation } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import { LayoutDashboard, Store, LogOut, Megaphone, Smartphone, MessageSquare, User, ChevronsUpDown } from 'lucide-react'
import { useAuthStore } from '@/store/auth/useAuthStore'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import { APP_VERSION } from '@/lib/version'

export const Route = createFileRoute('/admin')({
  ssr: false,
  component: AdminLayout,
})

function AdminLayout() {
  const token = useAuthStore((s) => s.access_token)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const [isLogoutOpen, setIsLogoutOpen] = useState(false)
  const [isCheckingRole, setIsCheckingRole] = useState(true)
  const [userMe, setUserMe] = useState<{ role?: string; phone_number?: string } | null>(null)

  useEffect(() => {
    if (!token) {
      navigate({ to: '/login', replace: true })
      setIsCheckingRole(false)
      return
    }

    let isMounted = true

    api.get('users/me/')
      .json<{ role?: string; phone_number?: string }>()
      .then((me) => {
        if (!isMounted) return

        if (me.role !== 'admin') {
          navigate({ to: '/merchant', replace: true })
          return
        }

        setUserMe(me)
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

  const activeClass = 'bg-emerald-50 dark:bg-emerald-950/50 font-semibold text-emerald-600 dark:text-emerald-400'
  const linkClass = 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors'

  const getPageHeader = () => {
    if (location.pathname.startsWith('/admin/messages')) {
      return { title: 'Messages Log', Icon: MessageSquare }
    }
    if (location.pathname.startsWith('/admin/sessions')) {
      return { title: 'WhatsApp Sessions', Icon: Smartphone }
    }
    if (location.pathname.startsWith('/admin/users')) {
      return { title: 'Users & Merchants', Icon: Store }
    }
    if (location.pathname.startsWith('/admin/campaigns')) {
      return { title: 'Campaigns', Icon: Megaphone }
    }
    return { title: 'Dashboard', Icon: LayoutDashboard }
  }

  const headerInfo = getPageHeader()
  const HeaderIcon = headerInfo.Icon

  const userLetter = userMe?.phone_number ? userMe.phone_number[0].toUpperCase() : 'A'
  const displayName = userMe?.phone_number || 'Super Admin'

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-950">
        <Sidebar className="border-r border-slate-200 dark:border-slate-800">
          <SidebarHeader className="h-14 flex items-center border-b border-slate-200 dark:border-slate-800 px-4">
            <Link to="/admin" className="flex items-center gap-2.5 text-lg font-bold hover:opacity-80 transition-opacity">
              <img src="/futuristic-whatsapp-logo.png" alt="WhatsBlast Logo" className="w-7 h-7 object-contain rounded-lg shadow-sm" />
              <span className="tracking-tight text-slate-900 dark:text-white"><span className="text-emerald-600 dark:text-emerald-400">Super</span>Admin {APP_VERSION}</span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup className="px-3 py-2">
              <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1">
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" asChild>
                      <Link to="/admin" activeProps={{ className: activeClass }} activeOptions={{ exact: true }} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${linkClass}`}>
                        <LayoutDashboard className="h-4 w-4 shrink-0" />
                        <span>Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" asChild>
                      <Link to="/admin/users" activeProps={{ className: activeClass }} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${linkClass}`}>
                        <Store className="h-4 w-4 shrink-0" />
                        <span>Users & Merchants</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" asChild>
                      <Link to="/admin/campaigns" activeProps={{ className: activeClass }} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${linkClass}`}>
                        <Megaphone className="h-4 w-4 shrink-0" />
                        <span>Campaigns</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" asChild>
                      <Link to="/admin/messages" activeProps={{ className: activeClass }} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${linkClass}`}>
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <span>Messages</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" asChild>
                      <Link to="/admin/sessions" activeProps={{ className: activeClass }} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${linkClass}`}>
                        <Smartphone className="h-4 w-4 shrink-0" />
                        <span>WhatsApp Sessions</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-slate-200 dark:border-slate-800 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group outline-none">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white font-semibold text-sm shadow-sm">
                    {userLetter}
                  </div>
                  <div className="flex flex-1 flex-col overflow-hidden text-sm">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">{displayName}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate">Administrator</span>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56 mb-1">
                <DropdownMenuItem disabled className="flex items-center opacity-70">
                  <User className="mr-2 h-4 w-4" />
                  <span>Admin Account</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-600" onClick={() => setIsLogoutOpen(true)}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <main className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2.5">
              <SidebarTrigger className="mr-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" />
              <HeaderIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                {headerInfo.title}
              </h1>
            </div>
          </header>
          <div className="flex-1 overflow-auto p-4 sm:p-4.5">
            <Outlet />
          </div>
        </main>
      </div>

      <Dialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Logout?</DialogTitle>
            <DialogDescription>You are about to logout from the admin panel.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogoutOpen(false)}>Cancel</Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
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
    </SidebarProvider>
  )
}
