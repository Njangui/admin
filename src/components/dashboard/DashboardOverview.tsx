'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Home, Users, Calendar, DollarSign, Clock, AlertCircle, Sparkles, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StatCard, LoadingSpinner } from '@/components/ui/index'
import { formatPrice, formatDate, cn } from '@/lib/utils/index'
import type { DailyReport } from '@/types/index'

interface Stats {
  pendingListings: number; publishedListings: number
  totalUsers: number; newUsersToday: number
  bookingsPaid: number; totalBookings: number
  activeAgents: number; pendingAgents: number
  commissionsDue: number; commissionsAmount: number
  escalatedConvs: number
}

export function DashboardOverview() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState<Stats | null>(null)
  const [activities, setActivities] = useState<any[]>([])
  const [report, setReport] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const [
      { count: pendingListings },
      { count: publishedListings },
      { count: totalUsers },
      { count: newUsersToday },
      { count: bookingsPaid },
      { count: totalBookings },
      { count: activeAgents },
      { count: pendingAgents },
      { count: commissionsDue },
      { data: commAmt },
      { count: escalatedConvs },
      { data: latestReport },
      { data: recentListings },
      { data: recentBookings },
    ] = await Promise.all([
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', `${today}T00:00:00`),
      supabase.from('visit_bookings').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
      supabase.from('visit_bookings').select('id', { count: 'exact', head: true }),
      supabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('commissions').select('id', { count: 'exact', head: true }).eq('status', 'due'),
      supabase.from('commissions').select('total_commission').eq('status', 'due'),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).not('escalated_to', 'is', null),
      supabase.from('daily_reports').select('*').order('report_date', { ascending: false }).limit(1),
      supabase.from('listings').select('id, title, created_at').eq('status', 'pending_review').order('created_at', { ascending: false }).limit(4),
      supabase.from('visit_bookings').select('id, nb_listings, created_at').eq('status', 'paid').order('created_at', { ascending: false }).limit(3),
    ])

    setStats({
      pendingListings: pendingListings ?? 0,
      publishedListings: publishedListings ?? 0,
      totalUsers: totalUsers ?? 0,
      newUsersToday: newUsersToday ?? 0,
      bookingsPaid: bookingsPaid ?? 0,
      totalBookings: totalBookings ?? 0,
      activeAgents: activeAgents ?? 0,
      pendingAgents: pendingAgents ?? 0,
      commissionsDue: commissionsDue ?? 0,
      commissionsAmount: (commAmt ?? []).reduce((s: number, c: any) => s + (c.total_commission ?? 0), 0),
      escalatedConvs: escalatedConvs ?? 0,
    })

    if (latestReport?.[0]) setReport(latestReport[0] as DailyReport)

    const acts: any[] = [
      ...(recentListings ?? []).map((l: any) => ({ id: l.id, type: 'listing', title: l.title?.slice(0, 50) ?? '—', subtitle: 'En attente de validation', time: l.created_at, urgent: true })),
      ...(recentBookings ?? []).map((b: any) => ({ id: b.id, type: 'booking', title: `Visite ${b.nb_listings} bien(s) payée`, subtitle: 'À assigner à un agent', time: b.created_at, urgent: true })),
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8)
    setActivities(acts)
    setLoading(false)
  }

  if (loading || !stats) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Vue d&apos;ensemble</h1>
        <p className="text-sm text-gray-400 mt-0.5">{formatDate(new Date().toISOString())} · Habynex Yaoundé</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Annonces publiées" value={stats.publishedListings} sub={`${stats.pendingListings} en attente`} icon={Home} color="bg-blue-500" />
        <StatCard title="Utilisateurs" value={stats.totalUsers} sub={`+${stats.newUsersToday} aujourd'hui`} icon={Users} color="bg-purple-500" />
        <StatCard title="Visites payées" value={stats.bookingsPaid} sub={`${stats.totalBookings} total`} icon={Calendar} color="bg-[#f95d1e]" />
        <StatCard title="Commissions dues" value={formatPrice(stats.commissionsAmount, true)} sub={`${stats.commissionsDue} à collecter`} icon={DollarSign} color="bg-green-500" />
      </div>

      {/* Alertes */}
      {(stats.pendingListings > 0 || stats.bookingsPaid > 0 || stats.pendingAgents > 0 || stats.escalatedConvs > 0) && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={16} className="text-amber-500" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Actions requises</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.pendingListings > 0 && (
              <button onClick={() => router.push('/annonces')}
                className="px-3 py-1.5 bg-white dark:bg-gray-900 rounded-xl border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-700 dark:text-amber-400 hover:shadow-sm transition-shadow">
                🏠 {stats.pendingListings} annonce{stats.pendingListings > 1 ? 's' : ''} à valider
              </button>
            )}
            {stats.bookingsPaid > 0 && (
              <button onClick={() => router.push('/reservations')}
                className="px-3 py-1.5 bg-white dark:bg-gray-900 rounded-xl border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-700 dark:text-amber-400 hover:shadow-sm transition-shadow">
                📅 {stats.bookingsPaid} visite{stats.bookingsPaid > 1 ? 's' : ''} à assigner
              </button>
            )}
            {stats.pendingAgents > 0 && (
              <button onClick={() => router.push('/agents')}
                className="px-3 py-1.5 bg-white dark:bg-gray-900 rounded-xl border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-700 dark:text-amber-400 hover:shadow-sm transition-shadow">
                👤 {stats.pendingAgents} agent{stats.pendingAgents > 1 ? 's' : ''} en attente
              </button>
            )}
            {stats.escalatedConvs > 0 && (
              <button onClick={() => router.push('/conversations')}
                className="px-3 py-1.5 bg-white dark:bg-gray-900 rounded-xl border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-700 dark:text-amber-400 hover:shadow-sm transition-shadow">
                💬 {stats.escalatedConvs} conversation{stats.escalatedConvs > 1 ? 's' : ''} escaladée{stats.escalatedConvs > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Activité récente */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Activité récente</h2>
            <Clock size={15} className="text-gray-400" />
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {activities.length === 0 ? (
              <p className="text-center py-8 text-sm text-gray-400">Aucune activité récente</p>
            ) : activities.map((act, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm',
                  act.type === 'listing' ? 'bg-blue-100 dark:bg-blue-950' : 'bg-orange-100 dark:bg-orange-950')}>
                  {act.type === 'listing' ? '🏠' : '📅'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{act.title}</p>
                  <p className="text-xs text-gray-400">{act.subtitle}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">{formatDate(act.time, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  {act.urgent && <p className="text-[10px] text-amber-500 font-semibold">Urgent</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rapport IA */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-[#f95d1e]" />
              <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Rapport IA</h2>
            </div>
            {report && <span className="text-xs text-gray-400">{formatDate(report.report_date)}</span>}
          </div>
          {!report ? (
            <div className="p-5 text-center">
              <FileText size={28} className="text-gray-200 dark:text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Aucun rapport</p>
              <p className="text-xs text-gray-300 mt-1">Généré automatiquement à 22h</p>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {report.kpi_snapshot && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['👤', 'Nouveaux', report.kpi_snapshot.new_users ?? 0],
                    ['💬', 'Messages', report.kpi_snapshot.messages_sent ?? 0],
                    ['📅', 'Réservations', report.kpi_snapshot.bookings ?? 0],
                    ['🏠', 'Publiées', report.kpi_snapshot.published_listings ?? 0],
                  ].map(([icon, label, val]) => (
                    <div key={String(label)} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-2.5 text-center">
                      <p className="text-base font-bold text-gray-900 dark:text-white">{val}</p>
                      <p className="text-[10px] text-gray-400">{icon} {label}</p>
                    </div>
                  ))}
                </div>
              )}
              {report.suggestions && report.suggestions.length > 0 && (
                <div className="space-y-2">
                  {report.suggestions.slice(0, 3).map((s, i) => (
                    <div key={i} className={cn('p-2.5 rounded-xl text-xs', {
                      'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400': s.priority === 'high',
                      'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400': s.priority === 'medium',
                      'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400': s.priority === 'low',
                    })}>
                      <p className="font-semibold">{s.title}</p>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => router.push('/rapports')} className="w-full text-center text-xs font-semibold text-[#f95d1e] hover:underline">
                Voir le rapport complet →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats secondaires */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Agents actifs', value: stats.activeAgents, color: 'text-green-500' },
          { label: 'Agents en attente', value: stats.pendingAgents, color: 'text-amber-500' },
          { label: 'Commissions dues', value: stats.commissionsDue, color: 'text-red-500' },
          { label: 'Convs escaladées', value: stats.escalatedConvs, color: 'text-purple-500' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 text-center">
            <p className={cn('text-3xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
