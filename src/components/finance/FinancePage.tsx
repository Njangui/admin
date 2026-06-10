'use client'

/**
 * HABYNEX — Finance Dashboard
 * Vue financière complète : revenus, commissions, visites, projections
 * Conçu pour les investisseurs et le suivi interne
 */

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard, Users,
  Calendar, ArrowUpRight, ArrowDownRight, Download, RefreshCw,
  BarChart3, PieChart, Wallet, Building2, Target, Zap, ChevronDown
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner, PageHeader } from '@/components/ui/index'
import { formatDate, cn } from '@/lib/utils/index'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface FinanceSnapshot {
  // Revenus visites
  visitRevenue: { total: number; thisMonth: number; lastMonth: number; count: number }
  // Commissions
  commissions: {
    totalCollected: number; thisMonth: number; lastMonth: number
    totalDue: number; duePending: number
    agentsPaid: number; habynexNet: number
  }
  // Vue globale
  totalRevenue: number
  totalRevenueThisMonth: number
  totalRevenueLastMonth: number
  // Agents
  agentsActive: number
  avgRevenuePerAgent: number
  // Visites
  visitsCompleted: number; visitsTotal: number; visitSuccessRate: number
  // Distribution
  freeVisits: number; paidVisits: number
  // Évolution mensuelle (12 derniers mois)
  monthlyRevenue: MonthlyRevenue[]
  // Top agents par revenus générés
  topAgents: TopAgent[]
  // Dernières transactions
  recentTransactions: Transaction[]
}

interface MonthlyRevenue {
  month: string       // "Jan 2025"
  label: string       // pour l'affichage
  visits: number
  commissions: number
  total: number
}

interface TopAgent {
  id: string
  name: string
  missionsCompleted: number
  totalCommission: number
  successRate: number
}

interface Transaction {
  id: string
  type: 'visit' | 'commission'
  label: string
  amount: number
  status: string
  date: string
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function fmt(n: number, compact = false): string {
  if (compact && n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (compact && n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return n.toLocaleString('fr-FR')
}

function fmtFcfa(n: number, compact = false): string {
  return `${fmt(n, compact)} FCFA`
}

function growthPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

// ─────────────────────────────────────────────
// COMPOSANTS UI LOCAUX
// ─────────────────────────────────────────────

function KpiCard({
  title, value, sub, icon: Icon, color, growth, onClick
}: {
  title: string; value: string; sub?: string
  icon: React.ElementType; color: string; growth?: number; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 text-left w-full transition-all',
        onClick && 'hover:shadow-md hover:border-gray-200 dark:hover:border-gray-700 cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
          <Icon size={18} className="text-white" />
        </div>
        {growth !== undefined && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full',
            growth >= 0
              ? 'bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400'
              : 'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400'
          )}>
            {growth >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(growth)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mb-0.5">{value}</p>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </button>
  )
}

function SectionTitle({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon size={15} className="text-white dark:text-gray-900" />
      </div>
      <div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// GRAPHIQUE BARRES (SVG pur)
// ─────────────────────────────────────────────

function RevenueBarChart({ data }: { data: MonthlyRevenue[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const maxVal = Math.max(...data.map(d => d.total), 1)
  const W = 600; const H = 160; const padL = 8; const padR = 8; const padT = 16; const padB = 36
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const barW = Math.floor(chartW / data.length) - 4

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const y = padT + chartH * (1 - t)
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={W - padR} y2={y}
                stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
              <text x={padL} y={y - 3} fontSize={8} fill="currentColor" opacity={0.3}
                className="text-gray-500">
                {t > 0 ? fmtFcfa(maxVal * t, true) : ''}
              </text>
            </g>
          )
        })}

        {/* Barres */}
        {data.map((d, i) => {
          const x = padL + i * (chartW / data.length) + 2
          const visitH = (d.visits / maxVal) * chartH
          const commH = (d.commissions / maxVal) * chartH
          const totalH = (d.total / maxVal) * chartH
          const isHov = hovered === i
          return (
            <g key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              {/* Barre visits */}
              <rect
                x={x} y={padT + chartH - visitH}
                width={barW * 0.45} height={visitH}
                rx={3} fill="#f95d1e"
                opacity={isHov ? 1 : 0.8}
              />
              {/* Barre commissions */}
              <rect
                x={x + barW * 0.5} y={padT + chartH - commH}
                width={barW * 0.45} height={commH}
                rx={3} fill="#10b981"
                opacity={isHov ? 1 : 0.8}
              />
              {/* Tooltip au survol */}
              {isHov && (
                <g>
                  <rect x={x - 10} y={padT + chartH - totalH - 44}
                    width={90} height={40} rx={6}
                    fill="#111827" opacity={0.95} />
                  <text x={x + 35} y={padT + chartH - totalH - 28}
                    textAnchor="middle" fontSize={9} fill="white" fontWeight="bold">
                    {fmtFcfa(d.total, true)}
                  </text>
                  <text x={x + 35} y={padT + chartH - totalH - 16}
                    textAnchor="middle" fontSize={8} fill="#9ca3af">
                    {d.label}
                  </text>
                </g>
              )}
              {/* Label mois */}
              <text
                x={x + barW / 2} y={H - 8}
                textAnchor="middle" fontSize={8.5}
                fill="currentColor" opacity={isHov ? 1 : 0.45}
                fontWeight={isHov ? 'bold' : 'normal'}
                className="text-gray-500"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Légende */}
      <div className="flex items-center gap-4 mt-2 px-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#f95d1e] inline-block" />
          <span className="text-xs text-gray-400">Visites</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
          <span className="text-xs text-gray-400">Commissions</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// GRAPHIQUE DONUT (SVG pur)
// ─────────────────────────────────────────────

function DonutChart({ slices, size = 120 }: {
  slices: { label: string; value: number; color: string }[]; size?: number
}) {
  const total = slices.reduce((s, d) => s + d.value, 0)
  const r = 42; const cx = size / 2; const cy = size / 2
  let cumAngle = -Math.PI / 2

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => {
          if (s.value === 0) return null
          const angle = (s.value / total) * 2 * Math.PI
          const x1 = cx + r * Math.cos(cumAngle)
          const y1 = cy + r * Math.sin(cumAngle)
          cumAngle += angle
          const x2 = cx + r * Math.cos(cumAngle)
          const y2 = cy + r * Math.sin(cumAngle)
          const large = angle > Math.PI ? 1 : 0
          return (
            <path key={i}
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
              fill={s.color} stroke="white" strokeWidth={2}
            />
          )
        })}
        {/* Trou central */}
        <circle cx={cx} cy={cy} r={28} fill="white" className="dark:fill-gray-900" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={10}
          fontWeight="bold" fill="currentColor" className="text-gray-900 dark:fill-white">
          {fmt(total, true)}
        </text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize={7}
          fill="currentColor" opacity={0.5} className="text-gray-500">FCFA</text>
      </svg>
      <div className="space-y-2">
        {slices.map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{s.label}</span>
            <span className="text-xs font-bold text-gray-800 dark:text-white ml-auto pl-4">
              {fmtFcfa(s.value, true)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────────

export function FinancePage() {
  const supabase = createClient()
  const [data, setData] = useState<FinanceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month')

  const load = useCallback(async () => {
    const supabaseClient = supabase

    // Dates de référence
    const now = new Date()
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

    const [
      { data: allBookings },
      { data: allCommissions },
      { data: agents },
      { data: topAgentsRaw },
      { data: recentBookingsRaw },
      { data: recentCommissionsRaw },
    ] = await Promise.all([
      // Toutes les visites payées
      supabaseClient.from('visit_bookings')
        .select('id, amount_paid, is_free, status, created_at, paid_at')
        .eq('status', 'paid')
        .order('created_at', { ascending: false }),

      // Toutes les commissions
      supabaseClient.from('commissions')
        .select('id, total_commission, agent_amount, taxi_allowance, habynex_amount, status, created_at, agent_paid_at')
        .order('created_at', { ascending: false }),

      // Agents actifs
      supabaseClient.from('agents')
        .select('id, missions_completed, success_rate')
        .eq('status', 'active'),

      // Top agents avec commissions
      supabaseClient.from('agents')
        .select(`
          id, missions_completed, success_rate,
          profile:profiles!agents_id_fkey(full_name),
          commissions(total_commission, status)
        `)
        .eq('status', 'active')
        .order('missions_completed', { ascending: false })
        .limit(5),

      // Dernières visites
      supabaseClient.from('visit_bookings')
        .select('id, amount_paid, is_free, status, created_at, client:profiles!visit_bookings_client_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(6),

      // Dernières commissions
      supabaseClient.from('commissions')
        .select('id, total_commission, habynex_amount, status, created_at, listing:listings!commissions_listing_id_fkey(title)')
        .order('created_at', { ascending: false })
        .limit(4),
    ])

    const bookings = allBookings ?? []
    const commissions = allCommissions ?? []

    // ── Visites ──────────────────────────────
    const paidBookings = bookings.filter(b => !b.is_free)
    const freeBookings = bookings.filter(b => b.is_free)
    const visitTotal = paidBookings.reduce((s, b) => s + (b.amount_paid ?? 0), 0)
    const visitThisMonth = paidBookings
      .filter(b => b.created_at >= startThisMonth)
      .reduce((s, b) => s + (b.amount_paid ?? 0), 0)
    const visitLastMonth = paidBookings
      .filter(b => b.created_at >= startLastMonth && b.created_at <= endLastMonth)
      .reduce((s, b) => s + (b.amount_paid ?? 0), 0)

    // ── Commissions ──────────────────────────
    const collected = commissions.filter(c => c.status === 'collected' || c.status === 'paid_agent')
    const due = commissions.filter(c => c.status === 'due')
    const commTotal = collected.reduce((s, c) => s + (c.habynex_amount ?? 0), 0)
    const commThisMonth = collected
      .filter(c => c.created_at >= startThisMonth)
      .reduce((s, c) => s + (c.habynex_amount ?? 0), 0)
    const commLastMonth = collected
      .filter(c => c.created_at >= startLastMonth && c.created_at <= endLastMonth)
      .reduce((s, c) => s + (c.habynex_amount ?? 0), 0)
    const habynexNet = collected.reduce((s, c) => s + (c.habynex_amount ?? 0), 0)
    const agentsPaid = collected.reduce((s, c) => s + (c.agent_amount ?? 0) + (c.taxi_allowance ?? 0), 0)
    const duePending = due.reduce((s, c) => s + (c.total_commission ?? 0), 0)

    // ── Revenus totaux ────────────────────────
    const totalRevenue = visitTotal + commTotal
    const totalThisMonth = visitThisMonth + commThisMonth
    const totalLastMonth = visitLastMonth + commLastMonth

    // ── Agents ───────────────────────────────
    const activeAgents = agents?.length ?? 0
    const totalVisitsCompleted = agents?.reduce((s, a) => s + (a.missions_completed ?? 0), 0) ?? 0
    const avgSuccessRate = agents?.length
      ? Math.round(agents.reduce((s, a) => s + (a.success_rate ?? 0), 0) / agents.length)
      : 0

    // ── Évolution mensuelle (12 mois) ─────────
    const monthlyMap: Record<string, { visits: number; commissions: number }> = {}
    const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = { visits: 0, commissions: 0 }
    }

    paidBookings.forEach(b => {
      const k = b.created_at?.slice(0, 7)
      if (k && monthlyMap[k]) monthlyMap[k].visits += b.amount_paid ?? 0
    })
    collected.forEach(c => {
      const k = c.created_at?.slice(0, 7)
      if (k && monthlyMap[k]) monthlyMap[k].commissions += c.habynex_amount ?? 0
    })

    const monthlyRevenue: MonthlyRevenue[] = Object.entries(monthlyMap).map(([key, v]) => {
      const [year, month] = key.split('-').map(Number)
      return {
        month: key,
        label: MONTH_NAMES[month - 1],
        visits: v.visits,
        commissions: v.commissions,
        total: v.visits + v.commissions,
      }
    })

    // ── Top agents ────────────────────────────
    const topAgents: TopAgent[] = (topAgentsRaw ?? []).map((a: any) => {
      const profile = Array.isArray(a.profile) ? a.profile[0] : a.profile
      const comms = (a.commissions ?? []) as any[]
      const totalComm = comms
        .filter(c => c.status === 'collected' || c.status === 'paid_agent')
        .reduce((s: number, c: any) => s + (c.total_commission ?? 0), 0)
      return {
        id: a.id,
        name: profile?.full_name ?? 'Agent',
        missionsCompleted: a.missions_completed ?? 0,
        totalCommission: totalComm,
        successRate: Math.round((a.success_rate ?? 0) * 100),
      }
    }).sort((a: TopAgent, b: TopAgent) => b.totalCommission - a.totalCommission)

    // ── Transactions récentes ─────────────────
    const recentTransactions: Transaction[] = [
      ...(recentBookingsRaw ?? []).map((b: any) => {
        const client = Array.isArray(b.client) ? b.client[0] : b.client
        return {
          id: b.id,
          type: 'visit' as const,
          label: `Visite — ${client?.full_name ?? 'Client'}`,
          amount: b.amount_paid ?? 0,
          status: b.is_free ? 'gratuite' : 'payée',
          date: b.created_at,
        }
      }),
      ...(recentCommissionsRaw ?? []).map((c: any) => {
        const listing = Array.isArray(c.listing) ? c.listing[0] : c.listing
        return {
          id: c.id,
          type: 'commission' as const,
          label: `Commission — ${listing?.title?.slice(0, 30) ?? 'Bien'}`,
          amount: c.habynex_amount ?? 0,
          status: c.status,
          date: c.created_at,
        }
      }),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8)

    setData({
      visitRevenue: { total: visitTotal, thisMonth: visitThisMonth, lastMonth: visitLastMonth, count: paidBookings.length },
      commissions: {
        totalCollected: commTotal, thisMonth: commThisMonth, lastMonth: commLastMonth,
        totalDue: due.length, duePending, agentsPaid, habynexNet,
      },
      totalRevenue, totalRevenueThisMonth: totalThisMonth, totalRevenueLastMonth: totalLastMonth,
      agentsActive: activeAgents, avgRevenuePerAgent: activeAgents ? Math.round(commTotal / activeAgents) : 0,
      visitsCompleted: totalVisitsCompleted, visitsTotal: bookings.length,
      visitSuccessRate: avgSuccessRate,
      freeVisits: freeBookings.length, paidVisits: paidBookings.length,
      monthlyRevenue, topAgents, recentTransactions,
    })
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
  }

  if (loading) return <LoadingSpinner />
  if (!data) return null

  const totalGrowth = growthPct(data.totalRevenueThisMonth, data.totalRevenueLastMonth)
  const visitGrowth = growthPct(data.visitRevenue.thisMonth, data.visitRevenue.lastMonth)
  const commGrowth = growthPct(data.commissions.thisMonth, data.commissions.lastMonth)

  // Projection annuelle basée sur la moyenne des 3 derniers mois
  const last3 = data.monthlyRevenue.slice(-3).map(m => m.total)
  const avg3 = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0
  const projection = Math.round(avg3 * 12)

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Finance & Revenus"
          subtitle="Tableau de bord financier complet — données temps réel"
        />
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-gray-400 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* ── KPIs PRINCIPAUX ──────────────────────────────────────────── */}
      <div>
        <SectionTitle icon={BarChart3} title="Vue d'ensemble" sub={`Mis à jour le ${formatDate(new Date().toISOString(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Revenus totaux (all-time)"
            value={fmtFcfa(data.totalRevenue, true)}
            sub={`+${fmtFcfa(data.totalRevenueThisMonth, true)} ce mois`}
            icon={DollarSign}
            color="bg-[#f95d1e]"
            growth={totalGrowth}
          />
          <KpiCard
            title="Revenus visites terrain"
            value={fmtFcfa(data.visitRevenue.total, true)}
            sub={`${data.visitRevenue.count} visites payées`}
            icon={CreditCard}
            color="bg-blue-500"
            growth={visitGrowth}
          />
          <KpiCard
            title="Net Habynex (commissions)"
            value={fmtFcfa(data.commissions.habynexNet, true)}
            sub={`${data.commissions.totalDue} à collecter`}
            icon={Wallet}
            color="bg-emerald-500"
            growth={commGrowth}
          />
          <KpiCard
            title="Projection annuelle"
            value={fmtFcfa(projection, true)}
            sub="Basée sur les 3 derniers mois"
            icon={Target}
            color="bg-purple-500"
          />
        </div>
      </div>

      {/* ── GRAPHIQUE ÉVOLUTION ────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
        <SectionTitle icon={TrendingUp} title="Évolution des revenus" sub="12 derniers mois" />
        <RevenueBarChart data={data.monthlyRevenue} />
      </div>

      {/* ── RÉPARTITION + COMMISSIONS ────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Répartition revenus */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
          <SectionTitle icon={PieChart} title="Répartition des revenus" />
          <DonutChart slices={[
            { label: 'Visites terrain', value: data.visitRevenue.total, color: '#f95d1e' },
            { label: 'Net Habynex (commissions)', value: data.commissions.habynexNet, color: '#10b981' },
          ]} />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="bg-orange-50 dark:bg-orange-950/20 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-[#f95d1e]">{data.paidVisits}</p>
              <p className="text-xs text-gray-400 mt-0.5">Visites payées</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-950/20 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{data.freeVisits}</p>
              <p className="text-xs text-gray-400 mt-0.5">Visites gratuites (parrainage)</p>
            </div>
          </div>
        </div>

        {/* Détail commissions */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
          <SectionTitle icon={Building2} title="Détail commissions" sub="Flux financiers agents / Habynex" />
          <div className="space-y-3">
            {[
              {
                label: 'Commissions collectées (total brut)',
                value: data.commissions.totalCollected + data.commissions.agentsPaid,
                color: 'text-gray-800 dark:text-white',
                bg: 'bg-gray-50 dark:bg-gray-800',
                icon: '📥'
              },
              {
                label: 'Reversé aux agents',
                value: data.commissions.agentsPaid,
                color: 'text-blue-600 dark:text-blue-400',
                bg: 'bg-blue-50 dark:bg-blue-950/20',
                icon: '👤'
              },
              {
                label: 'Net Habynex (part plateforme)',
                value: data.commissions.habynexNet,
                color: 'text-emerald-600 dark:text-emerald-400',
                bg: 'bg-emerald-50 dark:bg-emerald-950/20',
                icon: '🏢'
              },
              {
                label: 'En attente de collecte',
                value: data.commissions.duePending,
                color: 'text-amber-600 dark:text-amber-400',
                bg: 'bg-amber-50 dark:bg-amber-950/20',
                icon: '⏳'
              },
            ].map(row => (
              <div key={row.label} className={cn('flex items-center justify-between px-4 py-3 rounded-xl', row.bg)}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{row.icon}</span>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{row.label}</span>
                </div>
                <span className={cn('text-sm font-bold', row.color)}>{fmtFcfa(row.value, true)}</span>
              </div>
            ))}
          </div>

          {/* Marge nette */}
          <div className="mt-4 p-4 bg-gradient-to-r from-[#f95d1e]/10 to-emerald-500/10 rounded-xl border border-[#f95d1e]/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-[#f95d1e]" />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Marge nette Habynex</span>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-[#f95d1e]">
                  {fmtFcfa(data.commissions.habynexNet + data.visitRevenue.total, true)}
                </p>
                <p className="text-xs text-gray-400">
                  {data.totalRevenue > 0
                    ? `${Math.round(((data.commissions.habynexNet + data.visitRevenue.total) / (data.totalRevenue + data.commissions.agentsPaid)) * 100)}% du brut`
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── AGENTS PERFORMANCE ───────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
        <SectionTitle icon={Users} title="Performance agents" sub={`${data.agentsActive} agents actifs · ${data.visitsCompleted} missions effectuées`} />
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: 'Agents actifs', value: data.agentsActive, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Revenu moyen / agent', value: fmtFcfa(data.avgRevenuePerAgent, true), color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Taux de succès moyen', value: `${data.visitSuccessRate}%`, color: 'text-[#f95d1e]' },
          ].map(s => (
            <div key={s.label} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tableau top agents */}
        {data.topAgents.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Agent', 'Missions', 'Taux succès', 'Commission générée'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {data.topAgents.map((agent, i) => (
                  <tr key={agent.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          'w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0',
                          i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-700' : 'bg-gray-200 dark:bg-gray-700'
                        )}>
                          {i < 3 ? ['🥇', '🥈', '🥉'][i] : <span className="text-gray-600 dark:text-gray-300">{i + 1}</span>}
                        </div>
                        <span className="font-medium text-gray-800 dark:text-white text-xs">{agent.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs text-gray-600 dark:text-gray-300 font-semibold">
                      {agent.missionsCompleted}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 max-w-[60px]">
                          <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${agent.successRate}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{agent.successRate}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {fmtFcfa(agent.totalCommission, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── TRANSACTIONS RÉCENTES ─────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
        <SectionTitle icon={CreditCard} title="Dernières transactions" sub="Visites et commissions" />
        <div className="space-y-2">
          {data.recentTransactions.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-400">Aucune transaction</p>
          ) : data.recentTransactions.map(tx => (
            <div key={tx.id} className="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors">
              <div className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0',
                tx.type === 'visit' ? 'bg-orange-100 dark:bg-orange-950/30' : 'bg-emerald-100 dark:bg-emerald-950/30'
              )}>
                {tx.type === 'visit' ? '🏠' : '💰'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{tx.label}</p>
                <p className="text-xs text-gray-400">
                  {formatDate(tx.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  <span className={cn(
                    'font-medium capitalize',
                    tx.status === 'payée' || tx.status === 'collected' || tx.status === 'paid_agent'
                      ? 'text-emerald-500' : 'text-amber-500'
                  )}>
                    {tx.status}
                  </span>
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                {tx.amount > 0 ? (
                  <p className={cn(
                    'text-sm font-bold',
                    tx.type === 'visit' ? 'text-[#f95d1e]' : 'text-emerald-600 dark:text-emerald-400'
                  )}>
                    +{fmtFcfa(tx.amount, true)}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">Gratuite</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MÉTRIQUES INVESTISSEURS ───────────────────────────────── */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-2 mb-5">
          <Target size={16} className="text-[#f95d1e]" />
          <h2 className="text-sm font-bold">Métriques clés — Vue investisseur</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            {
              label: 'Revenu total généré',
              value: fmtFcfa(data.totalRevenue + data.commissions.agentsPaid, true),
              note: 'Brut toutes sources'
            },
            {
              label: 'Revenu net plateforme',
              value: fmtFcfa(data.commissions.habynexNet + data.visitRevenue.total, true),
              note: 'Ce que Habynex conserve'
            },
            {
              label: 'Projection annuelle',
              value: fmtFcfa(projection, true),
              note: 'Basée sur tendance actuelle'
            },
            {
              label: 'Valeur cumulée agents',
              value: fmtFcfa(data.commissions.agentsPaid, true),
              note: `Reversé à ${data.agentsActive} agents`
            },
            {
              label: 'Croissance mensuelle',
              value: `${totalGrowth >= 0 ? '+' : ''}${totalGrowth}%`,
              note: 'vs mois précédent'
            },
            {
              label: 'Taux de conversion visites',
              value: `${data.visitSuccessRate}%`,
              note: 'Visites → succès terrain'
            },
          ].map(m => (
            <div key={m.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-xl font-bold text-white mb-0.5">{m.value}</p>
              <p className="text-xs font-medium text-gray-300">{m.label}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{m.note}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-5 text-center">
          Données extraites en temps réel depuis Supabase · {formatDate(new Date().toISOString())} · Habynex Yaoundé, Cameroun
        </p>
      </div>
    </div>
  )
}
