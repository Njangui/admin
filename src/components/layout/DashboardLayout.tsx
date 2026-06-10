'use client'
import React from 'react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Home, Calendar, Users, UserCheck, Camera, DollarSign, MessageSquare, BarChart2, Settings, LogOut, Menu, Bell, Sun, Moon, FileText, ClipboardList } from 'lucide-react'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/index'

const NAV = [
  { href:'/dashboard', label:"Vue d'ensemble", icon:LayoutDashboard },
  { href:'/annonces', label:'Annonces', icon:Home, badge:'pending' },
  { href:'/reservations', label:'Réservations', icon:Calendar, badge:'bookings' },
  { href:'/agents', label:'Agents', icon:UserCheck, badge:'agents' },
  { href:'/photographes', label:'Photographes', icon:Camera },
  { href:'/commissions', label:'Commissions', icon:DollarSign, badge:'commissions' },
  { href:'/utilisateurs', label:'Utilisateurs', icon:Users },
  { href:'/conversations', label:'Conversations', icon:MessageSquare, badge:'convs' },
  { href:'/contrats', label:'Contrats', icon:FileText },
  { href:'/rapports-terrain', label:'Rapports terrain', icon:ClipboardList },
  { href:'/rapports', label:'Rapports IA', icon:BarChart2 },
  { href:'/parametres', label:'Paramètres', icon:Settings },
]

interface Badges { pending:number; bookings:number; agents:number; commissions:number; convs:number }

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [badges, setBadges] = useState<Badges>({ pending:0, bookings:0, agents:0, commissions:0, convs:0 })
  const [adminName, setAdminName] = useState('Admin')
  const [notifCount, setNotifCount] = useState(0)

  useEffect(() => { loadBadges(); const i = setInterval(loadBadges, 30000); return () => clearInterval(i) }, [])
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  async function loadBadges() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [
      { data: profile },
      { count: pending }, { count: bookings }, { count: agents },
      { count: commissions }, { count: convs }, { count: notifs }
    ] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase.from('listings').select('id',{count:'exact',head:true}).eq('status','pending_review'),
      supabase.from('visit_bookings').select('id',{count:'exact',head:true}).eq('status','paid'),
      supabase.from('agents').select('id',{count:'exact',head:true}).eq('status','pending'),
      supabase.from('commissions').select('id',{count:'exact',head:true}).eq('status','due'),
      supabase.from('conversations').select('id',{count:'exact',head:true}).not('escalated_to','is',null),
      supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('is_read',false),
    ])
    setAdminName(profile?.full_name?.split(' ')[0] ?? 'Admin')
    setBadges({ pending:pending??0, bookings:bookings??0, agents:agents??0, commissions:commissions??0, convs:convs??0 })
    setNotifCount(notifs??0)
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const getBadge = (key?: string) => key ? badges[key as keyof Badges] ?? 0 : 0

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Overlay mobile */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={cn('fixed md:static inset-y-0 left-0 z-50 w-[248px] flex flex-col bg-[#111827] transition-transform duration-200', sidebarOpen?'translate-x-0':'-translate-x-full md:translate-x-0')}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-white/10 flex-shrink-0">
          <Image src="/habynex-icon.png" alt="Habynex" width={30} height={30} className="w-7 h-7 object-contain" />
          <div>
            <p className="text-white font-bold text-base leading-tight">habynex</p>
            <p className="text-gray-500 text-[10px] leading-tight">Administration</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5 no-scrollbar">
          {NAV.map(item => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            const badgeCount = getBadge(item.badge)
            return (
              <Link key={item.href} href={item.href}
                className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  isActive ? 'bg-[#f95d1e] text-white' : 'text-gray-400 hover:text-white hover:bg-white/8')}>
                <item.icon size={16} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {badgeCount > 0 && (
                  <span className={cn('min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1',
                    isActive ? 'bg-white/25 text-white' : 'bg-[#f95d1e] text-white')}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User bas */}
        <div className="px-3 py-4 border-t border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-8 h-8 bg-[#f95d1e] rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {adminName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{adminName}</p>
              <p className="text-gray-500 text-xs">Administrateur</p>
            </div>
          </div>
          <button onClick={signOut} className="w-full mt-1 flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 hover:text-red-400 hover:bg-white/5 transition-colors">
            <LogOut size={15} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <Menu size={20} />
          </button>
          <div className="hidden md:flex items-center text-sm font-medium text-gray-800 dark:text-white">
            {NAV.find(n => pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(n.href)))?.label ?? 'Dashboard'}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              {theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}
            </button>
            <button className="relative w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Bell size={17}/>
              {notifCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#f95d1e] rounded-full" />}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
