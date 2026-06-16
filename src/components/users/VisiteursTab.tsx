'use client'
import { useState, useEffect, useCallback } from 'react'
import { Eye, Users, TrendingUp, Calendar, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StatCard, LoadingSpinner } from '@/components/ui/index'
import { formatDate } from '@/lib/utils/index'

interface DayStats {
  date: string
  total: number
  unique: number
}

interface VisitorStats {
  today: number
  uniqueToday: number
  last7Days: number
  uniqueLast7Days: number
  last30Days: number
  uniqueLast30Days: number
  dailyBreakdown: DayStats[]
}

export function VisiteursTab() {
  const supabase = createClient()
  const [stats, setStats] = useState<VisitorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0]
    const ago7 = new Date(Date.now() - 7 * 86400000).toISOString()
    const ago30 = new Date(Date.now() - 30 * 86400000).toISOString()

    const [
      { data: todayData },
      { data: last7Data },
      { data: last30Data },
    ] = await Promise.all([
      supabase
        .from('site_visits')
        .select('visitor_id, created_at')
        .gte('created_at', `${today}T00:00:00`)
        .limit(10000),
      supabase
        .from('site_visits')
        .select('visitor_id, created_at')
        .gte('created_at', ago7)
        .limit(50000),
      supabase
        .from('site_visits')
        .select('visitor_id, created_at')
        .gte('created_at', ago30)
        .limit(100000),
    ])

    // Build daily breakdown from last 7 days data
    const dayMap: Record<string, { total: number; visitors: Set<string> }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
      dayMap[d] = { total: 0, visitors: new Set() }
    }
    ;(last7Data ?? []).forEach((v: any) => {
      const d = v.created_at?.split('T')[0]
      if (d && dayMap[d]) {
        dayMap[d].total++
        if (v.visitor_id) dayMap[d].visitors.add(v.visitor_id)
      }
    })

    const dailyBreakdown: DayStats[] = Object.entries(dayMap).map(([date, val]) => ({
      date,
      total: val.total,
      unique: val.visitors.size,
    }))

    setStats({
      today: (todayData ?? []).length,
      uniqueToday: new Set((todayData ?? []).map((v: any) => v.visitor_id).filter(Boolean)).size,
      last7Days: (last7Data ?? []).length,
      uniqueLast7Days: new Set((last7Data ?? []).map((v: any) => v.visitor_id).filter(Boolean)).size,
      last30Days: (last30Data ?? []).length,
      uniqueLast30Days: new Set((last30Data ?? []).map((v: any) => v.visitor_id).filter(Boolean)).size,
      dailyBreakdown,
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (loading) return <LoadingSpinner />

  const maxVisits = Math.max(...(stats?.dailyBreakdown.map(d => d.total) ?? [1]), 1)

  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Vues aujourd'hui"
          value={stats?.today ?? 0}
          sub={`${stats?.uniqueToday ?? 0} visiteur${(stats?.uniqueToday ?? 0) > 1 ? 's' : ''} unique${(stats?.uniqueToday ?? 0) > 1 ? 's' : ''}`}
          icon={Eye}
          color="bg-[#f95d1e]"
        />
        <StatCard
          title="Vues (7 jours)"
          value={stats?.last7Days ?? 0}
          sub={`${stats?.uniqueLast7Days ?? 0} visiteurs uniques`}
          icon={TrendingUp}
          color="bg-blue-500"
        />
        <StatCard
          title="Vues (30 jours)"
          value={stats?.last30Days ?? 0}
          sub={`${stats?.uniqueLast30Days ?? 0} visiteurs uniques`}
          icon={Users}
          color="bg-purple-500"
        />
      </div>

      {/* Daily bar chart */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-5">
          <Calendar size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Pages vues — 7 derniers jours
          </h3>
        </div>

        {stats?.dailyBreakdown.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Aucune donnée disponible</div>
        ) : (
          <div className="flex items-end gap-2 h-32">
            {stats?.dailyBreakdown.map((day) => {
              const heightPct = maxVisits > 0 ? (day.total / maxVisits) * 100 : 0
              const label = new Date(day.date + 'T12:00:00').toLocaleDateString('fr-FR', {
                weekday: 'short',
                day: 'numeric',
              })
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  {/* Tooltip */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {day.total} vues · {day.unique} uniques
                  </div>
                  <div className="w-full flex items-end" style={{ height: '96px' }}>
                    <div
                      className="w-full rounded-t-lg bg-[#f95d1e]/80 hover:bg-[#f95d1e] transition-colors"
                      style={{ height: `${Math.max(heightPct, day.total > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 text-center leading-tight">{label}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[#f95d1e]/80" />
            <span className="text-xs text-gray-400">Pages vues</span>
          </div>
          <div className="ml-auto text-xs text-gray-400">
            Moy. {stats ? Math.round(stats.last7Days / 7) : 0} vues/jour
          </div>
        </div>
      </div>

      {/* Daily breakdown table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Détail par jour</h3>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {stats?.dailyBreakdown.slice().reverse().map((day) => (
            <div key={day.date} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {new Date(day.date + 'T12:00:00').toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <p className="font-semibold text-gray-800 dark:text-white">{day.total}</p>
                  <p className="text-xs text-gray-400">pages vues</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-800 dark:text-white">{day.unique}</p>
                  <p className="text-xs text-gray-400">visiteurs uniques</p>
                </div>
              </div>
            </div>
          ))}
          {(!stats?.dailyBreakdown || stats.dailyBreakdown.every(d => d.total === 0)) && (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              <p className="text-3xl mb-2">📊</p>
              Aucune visite enregistrée sur les 7 derniers jours
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
