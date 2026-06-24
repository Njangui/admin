'use client'
import { useState, useEffect, useCallback } from 'react'
import { Eye, Users as UsersIcon, Smartphone, Monitor, Tablet, Globe, TrendingUp, Clock, MapPin, Home } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { StatCard, LoadingSpinner, Badge } from '@/components/ui/index'
import { formatDate, timeAgo, cn } from '@/lib/utils/index'
import type { SiteVisitorSummary } from '@/types/index'

const DEVICE_ICONS: Record<string, any> = {
  mobile: Smartphone, desktop: Monitor, tablet: Tablet,
}

const RANGES = [
  { value: 1, label: "Aujourd'hui" },
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
]

interface Stats {
  totalVisits: number
  uniqueVisitors: number
  anonymousVisitors: number
  topPages: { path: string; count: number }[]
  topDevices: { device: string; count: number }[]
  topGeo: { country: string; city: string; count: number }[]
  hourly: { hour: number; count: number }[]
  topListings: { listing_id: string; title: string; count: number }[]
}

export function VisiteursTab() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(7)
  const [stats, setStats] = useState<Stats | null>(null)
  const [visitors, setVisitors] = useState<SiteVisitorSummary[]>([])
  const [onlyAnonymous, setOnlyAnonymous] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: visits, count: totalVisits }, { data: summary }] = await Promise.all([
      supabase.from('site_visits')
        .select('visitor_id, user_id, path, device_type, country, city, listing_id, created_at', { count: 'exact' })
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(3000),
      supabase.from('site_visitors_summary')
        .select('*')
        .order('last_seen_at', { ascending: false })
        .limit(200),
    ])

    const v = visits ?? []
    const uniqueVisitorIds = new Set(v.map(r => r.visitor_id))
    const anonymousIds = new Set(v.filter(r => !r.user_id).map(r => r.visitor_id))

    const pathCounts: Record<string, number> = {}
    const deviceCounts: Record<string, number> = {}
    const geoCounts: Record<string, { country: string; city: string; count: number }> = {}
    const hourCounts: Record<number, number> = {}
    const listingCounts: Record<string, number> = {}

    v.forEach(r => {
      pathCounts[r.path] = (pathCounts[r.path] ?? 0) + 1
      const d = r.device_type ?? 'inconnu'
      deviceCounts[d] = (deviceCounts[d] ?? 0) + 1

      const country = r.country ?? 'Inconnu'
      const city = r.city ?? 'Inconnu'
      const geoKey = `${country}__${city}`
      if (!geoCounts[geoKey]) geoCounts[geoKey] = { country, city, count: 0 }
      geoCounts[geoKey].count++

      const hour = new Date(r.created_at).getHours()
      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1

      if (r.listing_id) listingCounts[r.listing_id] = (listingCounts[r.listing_id] ?? 0) + 1
    })

    const topPages = Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([path, count]) => ({ path, count }))
    const topDevices = Object.entries(deviceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([device, count]) => ({ device, count }))
    const topGeo = Object.values(geoCounts)
      .sort((a, b) => b.count - a.count).slice(0, 6)

    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourCounts[h] ?? 0 }))

    let topListings: Stats['topListings'] = []
    const listingIds = Object.entries(listingCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    if (listingIds.length > 0) {
      const { data: listingsData } = await supabase
        .from('listings')
        .select('id, title')
        .in('id', listingIds.map(([id]) => id))
      topListings = listingIds.map(([id, count]) => ({
        listing_id: id,
        title: listingsData?.find(l => l.id === id)?.title ?? 'Annonce supprimée',
        count,
      }))
    }

    setStats({
      totalVisits: totalVisits ?? v.length,
      uniqueVisitors: uniqueVisitorIds.size,
      anonymousVisitors: anonymousIds.size,
      topPages, topDevices, topGeo, hourly, topListings,
    })
    setVisitors(summary ?? [])
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  const filteredVisitors = onlyAnonymous
    ? visitors.filter(v => !v.last_known_user_id)
    : visitors

  const peakHour = stats?.hourly.reduce((max, h) => h.count > max.count ? h : max, { hour: 0, count: 0 })

  return (
    <div className="space-y-5">
      {/* Sélecteur de période */}
      <div className="flex gap-2">
        {RANGES.map(r => (
          <button key={r.value} onClick={() => setRange(r.value)}
            className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors',
              range === r.value
                ? 'bg-[#f95d1e] text-white border-[#f95d1e]'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300')}>
            {r.label}
          </button>
        ))}
      </div>

      {loading || !stats ? <LoadingSpinner /> : (
        <>
          {/* Stats globales */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Pages vues" value={stats.totalVisits} icon={Eye} color="bg-blue-500"
              sub={`sur ${range === 1 ? "aujourd'hui" : `les ${range} derniers jours`}`} />
            <StatCard title="Visiteurs uniques" value={stats.uniqueVisitors} icon={UsersIcon} color="bg-[#f95d1e]"
              sub="appareils/sessions distincts" />
            <StatCard title="Visiteurs non-inscrits" value={stats.anonymousVisitors} icon={Globe} color="bg-purple-500"
              sub="jamais connectés" />
            <StatCard title="Heure de pointe" value={peakHour ? `${peakHour.hour}h - ${peakHour.hour + 1}h` : '—'} icon={Clock} color="bg-green-500"
              sub={peakHour ? `${peakHour.count} vues` : 'pas assez de données'} />
          </div>

          {/* Répartition horaire */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
              <Clock size={15} className="text-[#f95d1e]" /> Répartition par heure de la journée
            </p>
            {stats.totalVisits === 0 ? (
              <p className="text-xs text-gray-400">Aucune donnée</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.hourly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-20" />
                  <XAxis dataKey="hour" tickFormatter={h => `${h}h`} tick={{ fontSize: 11 }} interval={1} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(value: number) => [`${value} vues`, '']} labelFormatter={h => `${h}h - ${Number(h) + 1}h`} />
                  <Bar dataKey="count" fill="#f95d1e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pages populaires + appareils */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <TrendingUp size={15} className="text-[#f95d1e]" /> Pages les plus visitées
              </p>
              {stats.topPages.length === 0 ? (
                <p className="text-xs text-gray-400">Aucune donnée</p>
              ) : (
                <div className="space-y-2">
                  {stats.topPages.map(p => (
                    <div key={p.path} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600 dark:text-gray-300 truncate font-mono text-xs">{p.path}</span>
                      <span className="text-gray-400 text-xs flex-shrink-0">{p.count} vues</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <Smartphone size={15} className="text-[#f95d1e]" /> Appareils
              </p>
              {stats.topDevices.length === 0 ? (
                <p className="text-xs text-gray-400">Aucune donnée</p>
              ) : (
                <div className="space-y-2">
                  {stats.topDevices.map(d => {
                    const Icon = DEVICE_ICONS[d.device] ?? Globe
                    const pct = stats.totalVisits > 0 ? Math.round((d.count / stats.totalVisits) * 100) : 0
                    return (
                      <div key={d.device} className="flex items-center gap-3 text-sm">
                        <Icon size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-600 dark:text-gray-300 capitalize flex-1">{d.device}</span>
                        <span className="text-gray-400 text-xs">{d.count} ({pct}%)</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Géographie + Annonces les plus consultées */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <MapPin size={15} className="text-[#f95d1e]" /> Pays / Villes
              </p>
              {stats.topGeo.length === 0 ? (
                <p className="text-xs text-gray-400">Aucune donnée</p>
              ) : (
                <div className="space-y-2">
                  {stats.topGeo.map(g => {
                    const pct = stats.totalVisits > 0 ? Math.round((g.count / stats.totalVisits) * 100) : 0
                    return (
                      <div key={`${g.country}-${g.city}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-gray-600 dark:text-gray-300 truncate">
                          {g.city !== 'Inconnu' ? `${g.city}, ` : ''}{g.country}
                        </span>
                        <span className="text-gray-400 text-xs flex-shrink-0">{g.count} ({pct}%)</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <Home size={15} className="text-[#f95d1e]" /> Annonces les plus consultées
              </p>
              {stats.topListings.length === 0 ? (
                <p className="text-xs text-gray-400">Aucune donnée</p>
              ) : (
                <div className="space-y-2">
                  {stats.topListings.map(l => (
                    <div key={l.listing_id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600 dark:text-gray-300 truncate">{l.title}</span>
                      <span className="text-gray-400 text-xs flex-shrink-0">{l.count} vues</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Liste des visiteurs */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Derniers visiteurs ({filteredVisitors.length})
            </p>
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={onlyAnonymous} onChange={e => setOnlyAnonymous(e.target.checked)}
                className="rounded accent-[#f95d1e]" />
              Afficher uniquement les non-inscrits
            </label>
          </div>

          {filteredVisitors.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
              <p className="text-4xl mb-3">👁️</p>
              <p className="text-gray-500">Aucun visiteur enregistré</p>
              <p className="text-xs text-gray-400 mt-1">Le suivi démarre dès qu'un visiteur consulte le site</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredVisitors.map(v => {
                const Icon = DEVICE_ICONS[v.last_device_type ?? ''] ?? Globe
                return (
                  <div key={v.visitor_id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <Icon size={15} className="text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-mono">
                          {v.visitor_id.slice(0, 12)}…
                        </p>
                        {v.last_known_user_id
                          ? <Badge label="Inscrit" color="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" />
                          : <Badge label="Visiteur anonyme" color="bg-gray-100 text-gray-500 dark:bg-gray-800" />}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                        <span className="font-mono">{v.last_path}</span>
                        {v.last_city && <span>📍 {v.last_city}{v.last_country ? `, ${v.last_country}` : ''}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{v.visit_count} vue{v.visit_count > 1 ? 's' : ''}</p>
                      <p className="text-xs text-gray-400">{timeAgo(v.last_seen_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
