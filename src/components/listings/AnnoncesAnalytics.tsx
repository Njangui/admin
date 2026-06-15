'use client'
import { useState, useEffect, useCallback } from 'react'
import { BarChart3, Eye, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StatCard, LoadingSpinner } from '@/components/ui/index'
import { formatPrice } from '@/lib/utils/index'

const RANGES = [
  { value: 1, label: "Aujourd'hui" },
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
]

interface TopListing {
  id: string; title: string; price: number; status: string; views: number
}

export function AnnoncesAnalytics() {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(7)
  const [totalListingViews, setTotalListingViews] = useState(0)
  const [uniqueViewers, setUniqueViewers] = useState(0)
  const [publishedCount, setPublishedCount] = useState(0)
  const [topListings, setTopListings] = useState<TopListing[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: visits }, { count: published }] = await Promise.all([
      supabase.from('site_visits')
        .select('visitor_id, listing_id')
        .not('listing_id', 'is', null)
        .gte('created_at', since)
        .limit(5000),
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    ])

    const v = visits ?? []
    const counts: Record<string, number> = {}
    const uniques = new Set(v.map(r => r.visitor_id))
    v.forEach(r => { counts[r.listing_id as string] = (counts[r.listing_id as string] ?? 0) + 1 })

    const topIds = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    let top: TopListing[] = []
    if (topIds.length > 0) {
      const { data: listingsData } = await supabase
        .from('listings')
        .select('id, title, price, status')
        .in('id', topIds.map(([id]) => id))
      top = topIds.map(([id, views]) => {
        const l = listingsData?.find(x => x.id === id)
        return { id, title: l?.title ?? 'Annonce supprimée', price: l?.price ?? 0, status: l?.status ?? '—', views }
      })
    }

    setTotalListingViews(v.length)
    setUniqueViewers(uniques.size)
    setPublishedCount(published ?? 0)
    setTopListings(top)
    setLoading(false)
  }, [range])

  useEffect(() => { if (open) load() }, [open, load])

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <BarChart3 size={16} className="text-[#f95d1e]" /> Analytics des annonces
        </span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">
          <div className="flex gap-2">
            {RANGES.map(r => (
              <button key={r.value} onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  range === r.value
                    ? 'bg-[#f95d1e] text-white border-[#f95d1e]'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'}`}>
                {r.label}
              </button>
            ))}
          </div>

          {loading ? <LoadingSpinner /> : (
            <>
              <div className="grid sm:grid-cols-3 gap-4">
                <StatCard title="Vues de fiches" value={totalListingViews} icon={Eye} color="bg-blue-500"
                  sub={`sur ${range === 1 ? "aujourd'hui" : `les ${range} derniers jours`}`} />
                <StatCard title="Visiteurs uniques" value={uniqueViewers} icon={TrendingUp} color="bg-[#f95d1e]"
                  sub="ayant consulté une annonce" />
                <StatCard title="Annonces publiées" value={publishedCount} icon={BarChart3} color="bg-green-500"
                  sub="actuellement en ligne" />
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Top 5 des annonces les plus consultées</p>
                {topListings.length === 0 ? (
                  <p className="text-xs text-gray-400">Aucune donnée sur cette période</p>
                ) : (
                  <div className="space-y-2">
                    {topListings.map((l, i) => (
                      <div key={l.id} className="flex items-center gap-3 text-sm bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                        <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                        <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{l.title}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{formatPrice(l.price, true)}</span>
                        <span className="text-xs font-semibold text-[#f95d1e] flex-shrink-0">{l.views} vue{l.views > 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
