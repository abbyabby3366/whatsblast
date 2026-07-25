import { Outlet, createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
import { LayoutDashboard, Store, LogOut, Megaphone, Smartphone, Shield } from 'lucide-react'
import { useAuthStore } from '@/store/auth/useAuthStore'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'

export const Route = createFileRoute('/admin')({
  ssr: false,
  component: AdminLayout,
})

function AdminLayout() {
  const token = useAuthStore((s) => s.access_token)
  const logout = useAuthStore((s) => s.logout)
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

        if (me.role !== 'admin') {
          navigate({ to: '/merchant', replace: true })
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

  const activeClass = 'bg-slate-800 font-semibold text-white'
  const linkClass = 'text-slate-300 hover:text-white hover:bg-slate-800/50'

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-950">
        <Sidebar className="border-r border-slate-200 bg-slate-900 text-slate-100 dark:border-slate-800">
          <SidebarHeader className="flex h-16 items-center border-b border-slate-800 px-4">
            <div className="flex items-center gap-2 text-lg font-bold">
              <Shield className="h-6 w-6 text-blue-500" />
              <span><span className="text-blue-500">Super</span>Admin</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-slate-400">Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/admin" activeProps={{ className: activeClass }} activeOptions={{ exact: true }} className={linkClass}>
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Dashboard
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/admin/users" activeProps={{ className: activeClass }} className={linkClass}>
                        <Store className="mr-2 h-4 w-4" />
                        Users & Merchants
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/admin/campaigns" activeProps={{ className: activeClass }} className={linkClass}>
                        <Megaphone className="mr-2 h-4 w-4" />
                        Campaigns
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/admin/sessions" activeProps={{ className: activeClass }} className={linkClass}>
                        <Smartphone className="mr-2 h-4 w-4" />
                        WhatsApp Sessions
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
            <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">System Administration</h1>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 p-0 text-white hover:bg-slate-700">
                  A
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem disabled>Admin account</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-600" onClick={() => setIsLogoutOpen(true)}>
                  <LogOut className="mr-2 h-4 w-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <div className="flex-1 overflow-auto p-6">
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
