'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, XCircle, Trash2, Search, ExternalLink, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Badge, LoadingSpinner } from '@/components/ui/index'
import { formatPrice, formatDate, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

const STATUS_COLORS: Record<string,string> = {
  draft:'bg-gray-100 text-gray-500 dark:bg-gray-800',
  pending_review:'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  published:'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  rented:'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  archived:'bg-gray-100 text-gray-400 dark:bg-gray-800',
}
const STATUS_LABELS: Record<string,string> = { draft:'Brouillon', pending_review:'En attente', published:'Publié', rented:'Loué/Vendu', archived:'Archivé' }
const TYPE_LABELS: Record<string,string> = { apartment:'Appartement', studio:'Studio', room:'Chambre', villa:'Villa', duplex:'Duplex', commercial:'Commerce' }

export function AnnoncesPage() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string|null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('listings').select(`id,slug,title,type,transaction,price,status,published_at,created_at,neighborhood:neighborhoods(name),media:listing_media(url,is_cover)`, { count: 'exact' }).order('created_at', { ascending: false }).limit(50)
    if (statusFilter) q = q.eq('status', statusFilter)
    if (search) q = q.ilike('title', `%${search}%`)
    const { data } = await q
    setListings(data ?? [])
    setLoading(false)
  }, [statusFilter, search])

  useEffect(() => { load() }, [load])

  async function handlePublish(id: string) {
    setProcessing(id)
    await supabase.from('listings').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', id)
    toast.success('Annonce publiée ✅')
    await load()
    setProcessing(null)
  }

  async function handleReject(id: string) {
    setProcessing(id)
    await supabase.from('listings').update({ status: 'archived' }).eq('id', id)
    toast('Annonce rejetée', { icon: '🗑️' })
    await load()
    setProcessing(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer définitivement ?')) return
    setProcessing(id)
    await supabase.from('listings').delete().eq('id', id)
    toast.success('Annonce supprimée')
    await load()
    setProcessing(null)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Annonces" subtitle={`${listings.length} annonces`} />
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 flex-1 min-w-[200px]">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="flex-1 text-sm outline-none bg-transparent text-gray-700 dark:text-white placeholder:text-gray-300" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none cursor-pointer">
          <option value="">Tous</option>
          {Object.entries(STATUS_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Bien','Type','Prix','Quartier','Statut','Date','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listings.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">Aucune annonce</td></tr>
                : listings.map(l => {
                  const cover = (l.media as any[])?.find((m: any) => m.is_cover)?.url ?? (l.media as any[])?.[0]?.url
                  const neighborhood = Array.isArray(l.neighborhood) ? l.neighborhood[0] : l.neighborhood
                  return (
                    <tr key={l.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                            {cover ? <Image src={cover} alt="" width={40} height={40} className="object-cover w-full h-full" /> : <span className="w-full h-full flex items-center justify-center text-lg">🏠</span>}
                          </div>
                          <p className="font-medium text-gray-800 dark:text-gray-200 max-w-[160px] truncate">{l.title}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{TYPE_LABELS[l.type] ?? l.type}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">{formatPrice(l.price, true)}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{neighborhood?.name ?? '—'}</td>
                      <td className="px-4 py-3"><Badge label={STATUS_LABELS[l.status] ?? l.status} color={STATUS_COLORS[l.status] ?? ''} /></td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(l.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {l.slug && <a href={`${process.env.NEXT_PUBLIC_MAIN_APP_URL ?? 'https://habynex.com'}/bien/${l.slug}`} target="_blank" rel="noopener noreferrer" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><ExternalLink size={13} /></a>}
                          {l.status === 'pending_review' && <>
                            <button onClick={() => handlePublish(l.id)} disabled={processing === l.id} className="w-7 h-7 flex items-center justify-center rounded-lg text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors disabled:opacity-40">
                              {processing === l.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={15} />}
                            </button>
                            <button onClick={() => handleReject(l.id)} disabled={processing === l.id} className="w-7 h-7 flex items-center justify-center rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors disabled:opacity-40"><XCircle size={15} /></button>
                          </>}
                          <button onClick={() => handleDelete(l.id)} disabled={processing === l.id} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
