'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import {
  CheckCircle2, XCircle, Trash2, Search, ExternalLink,
  Loader2, MapPin, ChevronDown, ChevronUp, User, Phone
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Badge, LoadingSpinner } from '@/components/ui/index'
import { formatPrice, formatDate, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'
import { FaqEditor } from '@/components/faq/FaqEditor'

const STATUS_COLORS: Record<string, string> = {
  draft:          'bg-gray-100 text-gray-500 dark:bg-gray-800',
  pending_review: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  published:      'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  rented:         'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  archived:       'bg-gray-100 text-gray-400 dark:bg-gray-800',
  rejected:       'bg-red-100 text-red-500 dark:bg-red-950/30 dark:text-red-400',
}
const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', pending_review: 'En attente', published: 'Publié',
  rented: 'Loué/Vendu', archived: 'Archivé', rejected: 'Refusé',
}
const TYPE_LABELS: Record<string, string> = {
  apartment: 'Appartement', studio: 'Studio', room: 'Chambre',
  villa: 'Villa', duplex: 'Duplex', commercial: 'Commerce',
}
const TRANSACTION_LABELS: Record<string, string> = {
  rent: 'Location', sale: 'Vente', furnished: 'Meublé',
  coliving: 'Colocation', short_stay: 'Court séjour',
}

export function AnnoncesPage() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<{ id: string; agentId: string | null } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [faqListing, setFaqListing] = useState<{ id: string; title: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('listings').select(`
      id, slug, title, type, transaction, price, price_negotiable, status,
      published_at, created_at, address_hint, lat, lng,
      bedrooms, bathrooms, surface_m2, furnished,
      owner_name, owner_phone, amenities,
      submitted_by_agent, rejection_reason,
      neighborhood:neighborhoods(name),
      media:listing_media(url, is_cover),
      agent:profiles!listings_submitted_by_agent_fkey(full_name, phone)
    `, { count: 'exact' }).order('created_at', { ascending: false }).limit(100)
    if (statusFilter) q = q.eq('status', statusFilter)
    if (search) q = q.ilike('title', `%${search}%`)
    const { data } = await q
    setListings(data ?? [])
    setLoading(false)
  }, [statusFilter, search])

  useEffect(() => { load() }, [load])

  async function handlePublish(listing: any) {
    setProcessing(listing.id)
    await supabase.from('listings').update({
      status: 'published',
      published_at: new Date().toISOString(),
    }).eq('id', listing.id)

    if (listing.submitted_by_agent) {
      await supabase.from('notifications').insert({
        user_id: listing.submitted_by_agent,
        title: '✅ Annonce approuvée et publiée !',
        body: `Votre annonce "${listing.title}" est maintenant visible sur Habynex.`,
        action_url: `/bien/${listing.slug}`,
        channel: 'in_app',
      })
    }
    toast.success('Annonce publiée ✅')
    await load()
    setProcessing(null)
  }

  function openRejectModal(listing: any) {
    setRejectModal({ id: listing.id, agentId: listing.submitted_by_agent })
    setRejectReason('')
  }

  async function handleReject() {
    if (!rejectModal) return
    if (!rejectReason.trim()) { toast.error('Indiquez la raison du refus'); return }
    setProcessing(rejectModal.id)
    try {
      await supabase.from('listings').update({
        status: 'rejected',
        rejection_reason: rejectReason.trim(),
      }).eq('id', rejectModal.id)

      if (rejectModal.agentId) {
        const listing = listings.find(l => l.id === rejectModal.id)
        await supabase.from('notifications').insert({
          user_id: rejectModal.agentId,
          title: '❌ Annonce refusée',
          body: `Votre annonce "${listing?.title ?? ''}" a été refusée. Raison : ${rejectReason.trim()}`,
          channel: 'in_app',
        })
      }
      toast('Annonce refusée et agent notifié', { icon: '📩' })
      setRejectModal(null)
      setRejectReason('')
      await load()
    } finally {
      setProcessing(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer définitivement cette annonce ?')) return
    setProcessing(id)
    await supabase.from('listings').delete().eq('id', id)
    toast.success('Annonce supprimée')
    await load()
    setProcessing(null)
  }

  const pending = listings.filter(l => l.status === 'pending_review').length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Annonces"
        subtitle={`${listings.length} annonces${pending > 0 ? ` · ${pending} en attente` : ''}`}
      />

      {/* Alerte annonces en attente */}
      {pending > 0 && !statusFilter && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
          <span className="text-amber-500 text-lg">⏳</span>
          <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
            {pending} annonce{pending > 1 ? 's' : ''} en attente de validation
          </p>
          <button onClick={() => setStatusFilter('pending_review')}
            className="ml-auto text-xs text-amber-600 dark:text-amber-400 font-semibold underline hover:no-underline">
            Voir
          </button>
        </div>
      )}

      {/* Barre de recherche + filtre */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 flex-1 min-w-[200px]">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            className="flex-1 text-sm outline-none bg-transparent text-gray-700 dark:text-white placeholder:text-gray-300" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none cursor-pointer">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {listings.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
              <p className="text-4xl mb-3">🏠</p>
              <p className="text-gray-500">Aucune annonce</p>
            </div>
          ) : listings.map(l => {
            const cover = (l.media as any[])?.find((m: any) => m.is_cover)?.url ?? (l.media as any[])?.[0]?.url
            const neighborhood = Array.isArray(l.neighborhood) ? l.neighborhood[0] : l.neighborhood
            const agent = Array.isArray(l.agent) ? l.agent[0] : l.agent
            const isExp = expandedId === l.id

            return (
              <div key={l.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">

                {/* Ligne principale */}
                <div className="px-4 py-4 flex items-center gap-4">
                  {/* Photo */}
                  <div className="w-16 h-14 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                    {cover
                      ? <Image src={cover} alt="" width={64} height={56} className="object-cover w-full h-full" />
                      : <div className="w-full h-full flex items-center justify-center text-xl">🏠</div>}
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm text-gray-800 dark:text-white line-clamp-1">{l.title}</p>
                      <Badge label={STATUS_LABELS[l.status] ?? l.status} color={STATUS_COLORS[l.status] ?? ''} />
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                      <span className="font-bold text-gray-600 dark:text-gray-300">
                        {formatPrice(l.price, true)}{l.price_negotiable ? ' 〜' : ''}
                      </span>
                      <span>{TYPE_LABELS[l.type] ?? l.type} · {TRANSACTION_LABELS[l.transaction] ?? l.transaction}</span>
                      {neighborhood?.name && <span className="flex items-center gap-1"><MapPin size={10} />{neighborhood.name}</span>}
                      {agent?.full_name && <span className="flex items-center gap-1"><User size={10} />{agent.full_name}</span>}
                    </div>
                  </div>

                  {/* Actions rapides */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Bouton FAQ */}
                    <button
                      onClick={() => setFaqListing({ id: l.id, title: l.title })}
                      className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-400 hover:border-[#f95d1e] hover:text-[#f95d1e] transition-colors"
                    >
                      🤖 FAQ
                    </button>

                    {l.slug && (
                      <a href={`${process.env.NEXT_PUBLIC_MAIN_APP_URL ?? ''}/bien/${l.slug}`}
                        target="_blank" rel="noopener noreferrer"
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <ExternalLink size={13} />
                      </a>
                    )}
                    {l.status === 'pending_review' && (
                      <>
                        <button onClick={() => handlePublish(l)} disabled={processing === l.id}
                          className="w-8 h-8 flex items-center justify-center rounded-xl text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors disabled:opacity-40">
                          {processing === l.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        </button>
                        <button onClick={() => openRejectModal(l)} disabled={processing === l.id}
                          className="w-8 h-8 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40">
                          <XCircle size={16} />
                        </button>
                      </>
                    )}
                    <button onClick={() => handleDelete(l.id)} disabled={processing === l.id}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40">
                      <Trash2 size={13} />
                    </button>
                    <button onClick={() => setExpandedId(isExp ? null : l.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Détails expandés */}
                {isExp && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4 animate-fade-in">
                    <div className="grid sm:grid-cols-2 gap-4">

                      {/* Détails bien */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Détails du bien</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'Chambres',    value: l.bedrooms ?? '—' },
                            { label: 'SDB',         value: l.bathrooms ?? '—' },
                            { label: 'Surface',     value: l.surface_m2 ? `${l.surface_m2}m²` : '—' },
                            { label: 'Meublé',      value: l.furnished ? 'Oui' : 'Non' },
                          ].map(d => (
                            <div key={d.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                              <p className="text-xs text-gray-400">{d.label}</p>
                              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{String(d.value)}</p>
                            </div>
                          ))}
                        </div>
                        {l.address_hint && (
                          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                            <p className="text-xs text-gray-400 mb-0.5">Repère</p>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{l.address_hint}</p>
                          </div>
                        )}
                        {l.lat && l.lng && (
                          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                            <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1"><MapPin size={10} />Coordonnées GPS</p>
                            <p className="text-xs font-mono text-gray-500">{l.lat.toFixed(5)}, {l.lng.toFixed(5)}</p>
                            <a href={`https://maps.google.com/?q=${l.lat},${l.lng}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:underline mt-0.5 inline-block">
                              Voir sur Google Maps →
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Agent + propriétaire */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Agent soumetteur</p>
                        {agent ? (
                          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-800 rounded-xl px-3 py-2">
                            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{agent.full_name}</p>
                            {agent.phone && (
                              <p className="text-xs text-blue-500 flex items-center gap-1 mt-0.5"><Phone size={10} />{agent.phone}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">Soumis directement (propriétaire)</p>
                        )}

                        {(l.owner_name || l.owner_phone) && (
                          <>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-3">Propriétaire</p>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                              {l.owner_name && <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{l.owner_name}</p>}
                              {l.owner_phone && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Phone size={10} />{l.owner_phone}</p>}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Raison du refus */}
                    {l.status === 'rejected' && l.rejection_reason && (
                      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
                        <p className="text-xs font-semibold text-red-500 mb-0.5">Raison du refus</p>
                        <p className="text-sm text-red-600 dark:text-red-400">{l.rejection_reason}</p>
                      </div>
                    )}

                    {/* Republier si refusé */}
                    {l.status === 'rejected' && (
                      <button onClick={() => supabase.from('listings').update({ status: 'pending_review', rejection_reason: null }).eq('id', l.id).then(() => load())}
                        className="px-4 py-2 bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-xl text-xs font-semibold hover:bg-amber-200 transition-colors">
                        Remettre en attente de validation
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modale FAQ ── */}
      {faqListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 shadow-2xl">
            <FaqEditor
              listingId={faqListing.id}
              listingTitle={faqListing.title}
              onClose={() => setFaqListing(null)}
            />
          </div>
        </div>
      )}

      {/* ── Modale refus ── */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 w-full max-w-md space-y-4"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 dark:text-white text-lg">Refuser cette annonce</h3>
            <p className="text-sm text-gray-500">L&apos;agent sera notifié avec la raison du refus.</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Ex: Photos de mauvaise qualité, prix non conforme au marché, informations insuffisantes…"
              rows={4}
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm bg-white dark:bg-gray-800 outline-none focus:border-red-400 resize-none text-gray-600 dark:text-gray-200 placeholder:text-gray-300"
            />
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)}
                className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-500 font-semibold rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm">
                Annuler
              </button>
              <button onClick={handleReject} disabled={processing !== null || !rejectReason.trim()}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {processing ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                Confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
