'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import {
  CheckCircle2, XCircle, ChevronDown, ChevronUp, Star, MapPin,
  Phone, Loader2, Zap, ZapOff, ZoomIn, X, ChevronLeft, ChevronRight,
  ShieldCheck, Camera,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Badge, LoadingSpinner } from '@/components/ui/index'
import { formatDate, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

const SC: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  reviewing: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  active:    'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  rejected:  'bg-gray-100 text-gray-500 dark:bg-gray-800',
}
const SL: Record<string, string> = {
  pending: 'En attente', reviewing: 'En cours', active: 'Actif',
  suspended: 'Suspendu', rejected: 'Rejeté',
}

// ── Lightbox pour prévisualiser les documents ─────────────────────────────────
interface LightboxProps {
  images: { url: string; label: string }[]
  initialIndex?: number
  onClose: () => void
}

function DocumentLightbox({ images, initialIndex = 0, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(initialIndex)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, images.length - 1))
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [images.length, onClose])

  const cur = images[idx]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>

        {/* Header lightbox */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-semibold text-sm">{cur.label}</p>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">{idx + 1} / {images.length}</span>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="relative bg-gray-900 rounded-2xl overflow-hidden" style={{ minHeight: 300, maxHeight: '70vh' }}>
          <Image
            src={cur.url}
            alt={cur.label}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 672px"
            unoptimized
          />
        </div>

        {/* Navigation */}
        {images.length > 1 && (
          <div className="flex items-center justify-center gap-4 mt-4">
            <button onClick={() => setIdx(i => Math.max(i - 1, 0))}
              disabled={idx === 0}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <div className="flex gap-1.5">
              {images.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)}
                  className={cn('w-2 h-2 rounded-full transition-all',
                    i === idx ? 'bg-white w-4' : 'bg-white/40')} />
              ))}
            </div>
            <button onClick={() => setIdx(i => Math.min(i + 1, images.length - 1))}
              disabled={idx === images.length - 1}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Lien téléchargement */}
        <div className="mt-3 text-center">
          <a href={cur.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-white underline transition-colors">
            Ouvrir en plein écran ↗
          </a>
        </div>
      </div>
    </div>
  )
}

// ── DocumentCard ─────────────────────────────────────────────────────────────
function DocumentCard({ url, label, icon, onZoom }: {
  url: string; label: string; icon: React.ReactNode; onZoom: () => void
}) {
  const [imgError, setImgError] = useState(false)

  return (
    <div className="relative group rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-[#f95d1e] transition-all cursor-pointer"
      onClick={onZoom} style={{ minHeight: 160 }}>
      {!imgError ? (
        <Image
          src={url}
          alt={label}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-200"
          sizes="(max-width: 640px) 100vw, 280px"
          onError={() => setImgError(true)}
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
          {icon}
          <p className="text-xs">Impossible d&apos;afficher</p>
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-[#f95d1e] hover:underline" onClick={e => e.stopPropagation()}>
            Ouvrir le lien ↗
          </a>
        </div>
      )}

      {/* Overlay hover */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg">
            <ZoomIn size={18} className="text-gray-800" />
          </div>
        </div>
      </div>

      {/* Label bas */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <p className="text-white text-xs font-semibold flex items-center gap-1">
          {icon} {label}
        </p>
      </div>
    </div>
  )
}

// ── AgentsPage ────────────────────────────────────────────────────────────────
export function AgentsPage() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [togglingPublish, setTogglingPublish] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [lightbox, setLightbox] = useState<{ images: { url: string; label: string }[]; idx: number } | null>(null)
  // Map<agentId, { front?: string; back?: string; selfie?: string }> — signed URLs
  const [signedUrls, setSignedUrls] = useState<Record<string, Record<string, string>>>({})

  /** Extrait le path Supabase à partir d'une URL publique ou signée */
  function extractPath(url: string): string | null {
    try {
      const u = new URL(url)
      // URL publique : /storage/v1/object/public/agent-documents/<path>
      // URL signée  : /storage/v1/object/sign/agent-documents/<path>
      const match = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/agent-documents\/(.+)/)
      return match ? decodeURIComponent(match[1].split('?')[0]) : null
    } catch { return null }
  }

  /** Génère les signed URLs pour tous les agents chargés */
  async function resolveSignedUrls(agents: any[]) {
    const result: Record<string, Record<string, string>> = {}
    await Promise.all(agents.map(async (a) => {
      const map: Record<string, string> = {}
      const rawUrls: { key: string; url: string }[] = []

      if (a.id_document_url) {
        a.id_document_url.split('|||').filter(Boolean).forEach((url: string, i: number) => {
          rawUrls.push({ key: i === 0 ? 'front' : 'back', url: url.trim() })
        })
      }
      if (a.selfie_url) rawUrls.push({ key: 'selfie', url: a.selfie_url })

      await Promise.all(rawUrls.map(async ({ key, url }) => {
        const path = extractPath(url)
        if (!path) { map[key] = url; return }
        const { data } = await supabase.storage
          .from('agent-documents')
          .createSignedUrl(path, 3600) // valide 1h
        map[key] = data?.signedUrl ?? url
      }))

      result[a.id] = map
    }))
    setSignedUrls(result)
  }

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('agents').select(`
      id, status, commission_model, ai_score, id_document_url, selfie_url,
      application_answers, missions_completed, created_at, neighborhood_id,
      can_auto_publish,
      profile:profiles!agents_id_fkey(full_name, phone, avatar_url),
      neighborhood:neighborhoods!agents_neighborhood_id_fkey(name)
    `).order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data } = await q
    const loaded = data ?? []
    setAgents(loaded)
    setLoading(false)
    // Résoudre les URLs signées en arrière-plan
    resolveSignedUrls(loaded)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function validate(id: string) {
    setProcessing(id)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('agents').update({
      status: 'active', validated_by: user?.id, validated_at: new Date().toISOString()
    }).eq('id', id)
    await supabase.from('user_roles').upsert({ user_id: id, role: 'agent' }, { onConflict: 'user_id,role' })
    await supabase.from('notifications').insert({
      user_id: id, title: '🎉 Candidature acceptée !',
      body: 'Vous êtes maintenant agent certifié Habynex.', channel: 'in_app',
    })
    toast.success('Agent validé ✅')
    await load()
    setProcessing(null)
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) { toast.error('Indiquez la raison'); return }
    setProcessing(id)
    await supabase.from('agents').update({ status: 'rejected', rejection_reason: rejectReason }).eq('id', id)
    await supabase.from('notifications').insert({
      user_id: id, title: 'Candidature non retenue',
      body: `Raison : ${rejectReason}`, channel: 'in_app',
    })
    toast('Rejeté et notifié', { icon: 'ℹ️' })
    setRejectReason('')
    setExpandedId(null)
    await load()
    setProcessing(null)
  }

  async function suspend(id: string) {
    await supabase.from('agents').update({ status: 'suspended' }).eq('id', id)
    await supabase.from('user_roles').delete().eq('user_id', id).eq('role', 'agent')
    toast('Agent suspendu', { icon: '⚠️' })
    await load()
  }

  async function toggleAutoPublish(agent: any) {
    const newVal = !agent.can_auto_publish
    setTogglingPublish(agent.id)
    try {
      const { error } = await supabase.from('agents').update({ can_auto_publish: newVal }).eq('id', agent.id)
      if (error) throw error
      await supabase.from('notifications').insert({
        user_id: agent.id,
        title: newVal ? '⚡ Publication directe activée' : '🔒 Publication directe désactivée',
        body: newVal
          ? 'L\'admin vous a accordé le droit de publier vos annonces directement sans validation.'
          : 'Vos prochaines annonces devront à nouveau passer par la validation admin.',
        channel: 'in_app',
      })
      toast.success(newVal ? 'Publication directe activée ⚡' : 'Publication directe désactivée')
      await load()
    } catch {
      toast.error('Erreur lors de la modification')
    } finally {
      setTogglingPublish(null)
    }
  }

  // Construire la liste d'images pour la lightbox (avec signed URLs si disponibles)
  function buildDocImages(agent: any): { url: string; label: string }[] {
    const imgs: { url: string; label: string }[] = []
    const signed = signedUrls[agent.id] ?? {}

    if (agent.id_document_url) {
      const parts = agent.id_document_url.split('|||').filter(Boolean)
      parts.forEach((rawUrl: string, i: number) => {
        const resolvedUrl = i === 0 ? (signed.front ?? rawUrl.trim()) : (signed.back ?? rawUrl.trim())
        imgs.push({ url: resolvedUrl, label: i === 0 ? '🪪 CNI / Passeport — Recto' : '🪪 CNI / Passeport — Verso' })
      })
    }
    if (agent.selfie_url) {
      imgs.push({ url: signed.selfie ?? agent.selfie_url, label: '🤳 Selfie de vérification' })
    }
    return imgs
  }

  return (
    <div className="space-y-5">
      {lightbox && (
        <DocumentLightbox
          images={lightbox.images}
          initialIndex={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}

      <PageHeader title="Agents" subtitle="Gestion des agents terrain" />

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {[{ value: '', label: 'Tous' }, ...Object.entries(SL).map(([v, l]) => ({ value: v, label: l }))].map(opt => (
          <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              statusFilter === opt.value
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 bg-white dark:bg-gray-900')}>
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {agents.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
              <p className="text-4xl mb-3">👤</p>
              <p className="text-gray-500">Aucun agent</p>
            </div>
          ) : agents.map(a => {
            const p = Array.isArray(a.profile) ? a.profile[0] : a.profile
            const n = Array.isArray(a.neighborhood) ? a.neighborhood[0] : a.neighborhood
            const isExp = expandedId === a.id
            const docImages = buildDocImages(a)

            return (
              <div key={a.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">

                {/* Ligne principale */}
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                      {p?.avatar_url
                        ? <Image src={p.avatar_url} alt="" width={40} height={40} className="object-cover w-full h-full" />
                        : <div className="w-full h-full flex items-center justify-center font-bold text-gray-400">{p?.full_name?.charAt(0) ?? '?'}</div>}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-gray-800 dark:text-white">{p?.full_name ?? 'Agent'}</p>
                        <Badge label={SL[a.status] ?? a.status} color={SC[a.status] ?? ''} />
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                          a.commission_model === 'A'
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400'
                            : 'bg-purple-100 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400')}>
                          Modèle {a.commission_model}
                        </span>
                        {a.can_auto_publish && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f95d1e]/10 text-[#f95d1e] flex items-center gap-1">
                            <Zap size={9} /> Publication directe
                          </span>
                        )}
                        {/* Badge documents soumis */}
                        {docImages.length > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <ShieldCheck size={9} /> {docImages.length} doc{docImages.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        {p?.phone && <span className="flex items-center gap-1"><Phone size={11} />{p.phone}</span>}
                        {n && <span className="flex items-center gap-1"><MapPin size={11} />{n.name}</span>}
                        {a.ai_score !== null && <span className="flex items-center gap-1 text-amber-500"><Star size={11} />Score IA: {a.ai_score}/10</span>}
                        <span>{a.missions_completed} mission{a.missions_completed > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {a.status === 'pending' && (
                      <button onClick={() => validate(a.id)} disabled={processing === a.id}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-green-100 dark:bg-green-950/30 text-green-600 hover:bg-green-200 transition-colors disabled:opacity-50">
                        {processing === a.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={15} />}
                      </button>
                    )}
                    {a.status === 'active' && (
                      <button onClick={() => suspend(a.id)}
                        className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-500 text-xs font-semibold hover:bg-red-100 transition-colors">
                        Suspendre
                      </button>
                    )}
                    <button onClick={() => setExpandedId(isExp ? null : a.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Détails expandés */}
                {isExp && (
                  <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-5 animate-fade-in">

                    {/* ── DOCUMENTS — Visualisation images ── */}
                    {docImages.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <ShieldCheck size={15} className="text-[#f95d1e]" />
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                            Documents d&apos;identité
                          </p>
                          <span className="text-[10px] bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                            Cliquez pour agrandir
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {/* CNI recto/verso */}
                          {a.id_document_url?.split('|||').filter(Boolean).map((rawUrl: string, i: number) => {
                            const s = signedUrls[a.id] ?? {}
                            const resolvedUrl = i === 0 ? (s.front ?? rawUrl.trim()) : (s.back ?? rawUrl.trim())
                            return (
                              <DocumentCard
                                key={`id-${i}`}
                                url={resolvedUrl}
                                label={i === 0 ? 'CNI Recto' : 'CNI Verso'}
                                icon={<ShieldCheck size={12} />}
                                onZoom={() => setLightbox({
                                  images: docImages,
                                  idx: i,
                                })}
                              />
                            )
                          })}

                          {/* Selfie */}
                          {a.selfie_url && (() => {
                            const selfieResolved = (signedUrls[a.id] ?? {}).selfie ?? a.selfie_url
                            return (
                              <DocumentCard
                                url={selfieResolved}
                                label="Selfie de vérification"
                                icon={<Camera size={12} />}
                                onZoom={() => setLightbox({
                                  images: docImages,
                                  idx: docImages.findIndex(d => d.url === selfieResolved),
                                })}
                              />
                            )
                          })()}
                        </div>

                        {/* Bouton "Voir tous les documents" */}
                        {docImages.length > 1 && (
                          <button
                            onClick={() => setLightbox({ images: docImages, idx: 0 })}
                            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:border-[#f95d1e] hover:text-[#f95d1e] transition-colors font-medium">
                            <ZoomIn size={14} /> Voir tous les documents ({docImages.length})
                          </button>
                        )}

                        {/* Message de comparaison */}
                        <div className="mt-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl px-4 py-3">
                          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                            <span className="text-base leading-none">💡</span>
                            <span>Vérifiez que le visage sur le selfie correspond bien à la photo sur la CNI/passeport avant de valider.</span>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Aucun document soumis */}
                    {docImages.length === 0 && (
                      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 rounded-xl px-4 py-3">
                        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                          ⚠️ Aucun document soumis par cet agent.
                        </p>
                      </div>
                    )}

                    {/* ── PUBLICATION DIRECTE ── */}
                    {a.status === 'active' && (
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Zap size={15} className={a.can_auto_publish ? 'text-[#f95d1e]' : 'text-gray-400'} />
                              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Publication directe</p>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed">
                              {a.can_auto_publish
                                ? 'Cet agent peut publier des annonces directement sans validation.'
                                : 'Activez pour permettre à cet agent de publier ses annonces immédiatement.'}
                            </p>
                          </div>
                          <button onClick={() => toggleAutoPublish(a)} disabled={togglingPublish === a.id}
                            className={cn('flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex-shrink-0 disabled:opacity-50',
                              a.can_auto_publish
                                ? 'bg-red-50 dark:bg-red-950/20 text-red-500 hover:bg-red-100 border border-red-200 dark:border-red-800'
                                : 'bg-[#f95d1e] text-white hover:bg-[#e04d0e] shadow-sm shadow-[#f95d1e]/30')}>
                            {togglingPublish === a.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : a.can_auto_publish
                                ? <><ZapOff size={14} /> Désactiver</>
                                : <><Zap size={14} /> Activer</>}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── RÉPONSES QUESTIONNAIRE ── */}
                    {a.application_answers && Object.keys(a.application_answers).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Réponses questionnaire</p>
                        <div className="space-y-2">
                          {Object.entries(a.application_answers).map(([k, v]) => (
                            <div key={k} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                              <p className="text-xs text-gray-400 capitalize mb-0.5">{k.replace('_', ' ')}</p>
                              <p className="text-sm text-gray-700 dark:text-gray-300">{String(v)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── DÉCISION ── */}
                    {(a.status === 'pending' || a.status === 'reviewing') && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Décision</p>
                        <div className="flex gap-3">
                          <button onClick={() => validate(a.id)} disabled={processing === a.id}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-2xl text-sm transition-colors disabled:opacity-50">
                            <CheckCircle2 size={15} /> Valider l&apos;agent
                          </button>
                          <div className="flex-1 space-y-2">
                            <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                              placeholder="Raison du rejet…"
                              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 outline-none focus:border-red-400" />
                            <button onClick={() => reject(a.id)} disabled={processing === a.id}
                              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-red-300 dark:border-red-800 text-red-500 font-semibold rounded-xl text-sm hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50">
                              <XCircle size={15} /> Rejeter
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
