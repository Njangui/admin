'use client'
import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  MessageSquare, Sparkles, UserCheck, Send, Loader2, ArrowLeft,
  BedDouble, Bath, Maximize2, MapPin, Phone, User, ExternalLink,
  DollarSign, Home, ChevronRight, Eye, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Badge, LoadingSpinner } from '@/components/ui/index'
import { timeAgo, formatPrice, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

const TYPE_LABELS: Record<string,string> = {
  apartment:'Appartement', studio:'Studio', room:'Chambre',
  villa:'Villa', duplex:'Duplex', commercial:'Commerce',
}
const TX_LABELS: Record<string,string> = {
  rent:'Location', sale:'Vente', furnished:'Meublé',
  coliving:'Colocation', short_stay:'Court séjour',
}

export function ConversationsAdmin() {
  const supabase = createClient()
  const [convs, setConvs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [filter, setFilter] = useState<'escalated'|'pending'|'active'|'all'>('pending')
  const [adminId, setAdminId] = useState<string|null>(null)
  const [adminRole, setAdminRole] = useState<string>('admin')
  const [showListingDetail, setShowListingDetail] = useState(false)
  const [listingDetail, setListingDetail] = useState<any>(null)
  const [listingLoading, setListingLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setAdminId(user?.id ?? null)
      if (user) {
        const { data } = await supabase
          .from('user_roles').select('role').eq('user_id', user.id)
          .in('role', ['super_admin', 'admin']).single()
        setAdminRole(data?.role ?? 'admin')
      }
    })
    loadConvs()
  }, [filter])

  useEffect(() => {
    if (!selected) return
    loadMessages(selected.id)
    const ch = supabase.channel(`admin-conv-${selected.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`conversation_id=eq.${selected.id}` },
        p => setMessages(prev => prev.find(m => m.id === p.new.id) ? prev : [...prev, p.new]))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selected])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  async function loadConvs() {
    setLoading(true)
    let q = supabase.from('conversations').select(`
      id, ai_active, escalated_at, escalation_reason, last_message_at,
      last_user_msg_at, admin_notified_at, claimed_by, pending_ai_reply,
      unread_count, created_at,
      client:profiles!conversations_client_id_fkey(full_name, phone, avatar_url),
      listing:listings!conversations_listing_id_fkey(
        id, title, slug, price, price_negotiable, type, transaction,
        bedrooms, bathrooms, surface_m2, furnished, address_hint, amenities,
        neighborhood:neighborhoods(name, city:cities(name)),
        media:listing_media(url, is_cover, display_order)
      ),
      claimed_by_profile:profiles!conversations_claimed_by_fkey(full_name)
    `).order('last_message_at', { ascending: false }).limit(100)

    // Super admin voit TOUT, admin normal voit seulement ses convs + non prises
    if (adminRole !== 'super_admin') {
      // Admin voit : non prises en main OU prises par lui-même
      // On ne filtre pas ici pour garder la visibilité, mais on marque
    }

    if (filter === 'pending') q = q.eq('pending_ai_reply', true)
    if (filter === 'escalated') q = q.not('escalated_at', 'is', null)
    if (filter === 'active') q = q.eq('ai_active', true)

    const { data } = await q
    setConvs(data ?? [])
    setLoading(false)
  }

  async function loadMessages(id: string) {
    setMsgLoading(true)
    const { data } = await supabase.from('messages')
      .select('id, role, content, sender_id, created_at, metadata')
      .eq('conversation_id', id).order('created_at', { ascending: true }).limit(80)
    setMessages(data ?? [])
    setMsgLoading(false)
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id)
  }

  async function loadListingDetail(listingId: string) {
    setListingLoading(true)
    const { data } = await supabase
      .from('listings')
      .select(`
        id, title, slug, price, price_negotiable, type, transaction,
        bedrooms, bathrooms, surface_m2, floor, furnished, amenities,
        address_hint, lat, lng, description, status, created_at,
        owner_name, owner_phone,
        neighborhood:neighborhoods(name, city:cities(name)),
        media:listing_media(url, is_cover, display_order),
        agent:profiles!listings_submitted_by_agent_fkey(full_name, phone)
      `)
      .eq('id', listingId).single()
    setListingDetail(data)
    setListingLoading(false)
    setShowListingDetail(true)
  }

  async function sendReply() {
    if (!reply.trim() || !selected || !adminId) return
    // Vérifier que personne d'autre n'a pris en main
    if (selected.claimed_by && selected.claimed_by !== adminId) {
      toast.error('Un autre conseiller répond déjà à cette conversation.')
      return
    }
    setSending(true)

    // Prendre en main si pas encore fait
    if (!selected.claimed_by) {
      await supabase.from('conversations').update({
        claimed_by: adminId,
        claimed_at: new Date().toISOString(),
        ai_active: false,
        pending_ai_reply: false,
      }).eq('id', selected.id)
    }

    await supabase.from('messages').insert({
      conversation_id: selected.id, sender_id: adminId,
      role: 'admin', content: reply.trim()
    })
    await supabase.from('conversations').update({
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    }).eq('id', selected.id)

    setReply('')
    setSending(false)
    setSelected((prev: any) => prev?.id === selected.id
      ? { ...prev, claimed_by: adminId, ai_active: false } : prev)
    await loadConvs()
  }

  async function takeOver(id: string) {
    if (!adminId) return
    // Vérifier qu'un autre admin ne l'a pas déjà prise
    const conv = convs.find(c => c.id === id)
    if (conv?.claimed_by && conv.claimed_by !== adminId) {
      const claimedName = Array.isArray(conv.claimed_by_profile)
        ? conv.claimed_by_profile[0]?.full_name : conv.claimed_by_profile?.full_name
      toast.error(`${claimedName ?? 'Un autre admin'} répond déjà.`)
      return
    }
    await supabase.from('conversations').update({
      ai_active: false, claimed_by: adminId,
      claimed_at: new Date().toISOString(),
      escalated_at: new Date().toISOString(),
      escalation_reason: 'Prise en main admin',
      pending_ai_reply: false,
    }).eq('id', id)
    toast.success('Conversation prise en main')
    await loadConvs()
    setSelected((prev: any) => prev?.id === id
      ? { ...prev, ai_active: false, claimed_by: adminId } : prev)
  }

  async function releaseConv(id: string) {
    await supabase.from('conversations').update({
      ai_active: true, claimed_by: null, claimed_at: null,
      escalated_at: null, escalation_reason: null,
    }).eq('id', id)
    toast.success('Conversation rendue à l\'IA')
    await loadConvs()
  }

  const FILTERS = [
    { v:'pending', l:'💬 En attente' },
    { v:'escalated', l:'🚨 Escaladées' },
    { v:'active', l:'🤖 IA active' },
    { v:'all', l:'Toutes' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Conversations"
        subtitle={adminRole === 'super_admin' ? 'Vue super admin — toutes les conversations' : 'Messagerie client'}
      />

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(opt => (
          <button key={opt.v} onClick={() => setFilter(opt.v as any)}
            className={cn('px-4 py-2 rounded-xl text-sm font-medium border transition-all',
              filter === opt.v
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 bg-white dark:bg-gray-900')}>
            {opt.l}
          </button>
        ))}
      </div>

      <div className="flex h-[calc(100vh-280px)] bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">

        {/* ── Liste conversations ──────────────────────────────────────── */}
        <div className={cn('flex flex-col border-r border-gray-100 dark:border-gray-800',
          selected ? 'hidden md:flex md:w-80' : 'flex-1 md:w-80')}>
          {loading ? <LoadingSpinner /> : convs.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-gray-400">
              <MessageSquare size={32} className="mb-2" />
              <p className="text-sm">Aucune conversation</p>
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {convs.map(conv => {
                const client = Array.isArray(conv.client) ? conv.client[0] : conv.client
                const listing = Array.isArray(conv.listing) ? conv.listing[0] : conv.listing
                const claimedBy = Array.isArray(conv.claimed_by_profile) ? conv.claimed_by_profile[0] : conv.claimed_by_profile
                const isMyConv = conv.claimed_by === adminId
                const isTakenByOther = conv.claimed_by && conv.claimed_by !== adminId
                const cover = listing?.media?.find((m: any) => m.is_cover)?.url ?? listing?.media?.[0]?.url

                return (
                  <button key={conv.id} onClick={() => setSelected(conv)}
                    className={cn('w-full flex gap-3 px-4 py-3.5 border-b border-gray-50 dark:border-gray-800/50 text-left hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors',
                      selected?.id === conv.id && 'bg-orange-50/60 dark:bg-orange-950/10')}>
                    <div className="relative w-10 h-10 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700">
                      {cover
                        ? <Image src={cover} alt="" fill className="object-cover" sizes="40px" />
                        : <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">🏠</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                          {client?.full_name ?? 'Client'}
                        </p>
                        {conv.last_message_at && (
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(conv.last_message_at)}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{listing?.title ?? '—'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {conv.pending_ai_reply && !conv.claimed_by && (
                          <span className="text-[10px] text-amber-500 font-medium">⏳ En attente</span>
                        )}
                        {conv.escalated_at && <span className="text-[10px] text-red-500 font-medium">🚨 Escaladée</span>}
                        {conv.ai_active && <span className="text-[10px] text-blue-500 font-medium flex items-center gap-0.5"><Sparkles size={9} />IA</span>}
                        {isMyConv && <span className="text-[10px] text-green-500 font-medium">✅ Vous</span>}
                        {isTakenByOther && <span className="text-[10px] text-purple-500 font-medium truncate">👤 {claimedBy?.full_name?.split(' ')[0]}</span>}
                        {(conv.unread_count ?? 0) > 0 && (
                          <span className="ml-auto min-w-[16px] h-4 bg-[#f95d1e] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Chat ────────────────────────────────────────────────────────── */}
        {selected ? (
          <div className="flex-1 flex min-w-0 relative">
            <div className={cn('flex-1 flex flex-col min-w-0 transition-all', showListingDetail ? 'hidden lg:flex' : 'flex')}>

              {/* Header chat */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
                <button onClick={() => setSelected(null)}
                  className="md:hidden w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <ArrowLeft size={16} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-gray-800 dark:text-white truncate">
                      {(Array.isArray(selected.client) ? selected.client[0] : selected.client)?.full_name ?? 'Client'}
                    </p>
                    {selected.escalated_at
                      ? <Badge label="🚨 Escaladée" color="bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400" />
                      : selected.ai_active
                        ? <Badge label="🤖 IA active" color="bg-blue-100 text-blue-600" />
                        : <Badge label="👤 Admin" color="bg-gray-100 text-gray-600 dark:bg-gray-800" />}
                    {selected.claimed_by && selected.claimed_by !== adminId && (
                      <Badge label={`Pris par ${(Array.isArray(selected.claimed_by_profile) ? selected.claimed_by_profile[0] : selected.claimed_by_profile)?.full_name?.split(' ')[0] ?? 'admin'}`}
                        color="bg-purple-100 text-purple-600 dark:bg-purple-950/30" />
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {(Array.isArray(selected.listing) ? selected.listing[0] : selected.listing)?.title ?? '—'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Bouton voir annonce */}
                  <button
                    onClick={() => {
                      const l = Array.isArray(selected.listing) ? selected.listing[0] : selected.listing
                      if (l?.id) loadListingDetail(l.id)
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <Eye size={12} /> Annonce
                  </button>

                  {selected.ai_active || !selected.claimed_by ? (
                    <button onClick={() => takeOver(selected.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f95d1e] hover:bg-[#e84e0f] text-white text-xs font-semibold rounded-xl transition-colors">
                      <UserCheck size={12} /> Prendre
                    </button>
                  ) : selected.claimed_by === adminId ? (
                    <button onClick={() => releaseConv(selected.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <Sparkles size={12} /> Rendre à l&apos;IA
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {msgLoading
                  ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
                  : messages.map(msg => {
                    if (msg.metadata?.type === 'listing_card') {
                      return <AdminListingCardMessage key={msg.id} msg={msg} onViewDetail={() => {
                        if (msg.metadata?.listing?.id) loadListingDetail(msg.metadata.listing.id)
                      }} />
                    }
                    const isUser = msg.role === 'user'
                    const isAI = msg.role === 'ai'
                    return (
                      <div key={msg.id} className={cn('flex gap-2 items-end', isUser ? 'flex-row' : 'flex-row-reverse')}>
                        <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0',
                          isAI ? 'bg-blue-100 dark:bg-blue-950' : msg.role === 'admin' ? 'bg-[#f95d1e]/10' : 'bg-gray-100 dark:bg-gray-800')}>
                          {isAI ? '🤖' : msg.role === 'admin' ? '👤' : '💬'}
                        </div>
                        <div className={cn('max-w-[72%] rounded-2xl px-4 py-2.5 text-sm',
                          isUser ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white rounded-bl-sm'
                          : isAI ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 rounded-br-sm'
                          : 'bg-[#f95d1e] text-white rounded-br-sm')}>
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          <p className={cn('text-[10px] mt-1 text-right',
                            isUser ? 'text-gray-400' : isAI ? 'text-blue-400' : 'text-white/60')}>
                            {timeAgo(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    )
                  })
                }
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">
                {selected.claimed_by && selected.claimed_by !== adminId ? (
                  <p className="flex-1 text-sm text-center text-gray-400 py-2">
                    👤 {(Array.isArray(selected.claimed_by_profile) ? selected.claimed_by_profile[0] : selected.claimed_by_profile)?.full_name?.split(' ')[0]} répond à cette conversation
                  </p>
                ) : (
                  <>
                    <input value={reply} onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                      placeholder="Répondre en tant qu'admin…"
                      className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-white bg-white dark:bg-gray-800 outline-none focus:border-gray-400 transition-colors" />
                    <button onClick={sendReply} disabled={!reply.trim() || sending}
                      className="w-10 h-10 bg-[#f95d1e] hover:bg-[#e84e0f] disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
                      {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── Panel détail annonce ─────────────────────────────────────── */}
            {showListingDetail && (
              <div className="w-80 flex-shrink-0 border-l border-gray-100 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
                  <p className="font-semibold text-sm text-gray-800 dark:text-white">Détails de l&apos;annonce</p>
                  <button onClick={() => setShowListingDetail(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {listingLoading ? (
                    <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
                  ) : listingDetail ? (
                    <ListingDetailPanel listing={listingDetail} />
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-8">Annonce introuvable</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center flex-col text-gray-400 gap-2">
            <MessageSquare size={40} className="text-gray-200 dark:text-gray-700" />
            <p className="text-sm">Sélectionnez une conversation</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── AdminListingCardMessage ───────────────────────────────────────────────────
function AdminListingCardMessage({ msg, onViewDetail }: { msg: any; onViewDetail: () => void }) {
  const l = msg.metadata?.listing
  if (!l) return null
  const cover = l.media?.find((m: any) => m.is_cover)?.url ?? l.media?.[0]?.url
  const nbh = Array.isArray(l.neighborhood) ? l.neighborhood[0] : l.neighborhood

  return (
    <div className="flex justify-end">
      <div className="max-w-[72%] bg-gray-50 dark:bg-gray-800 rounded-2xl rounded-br-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {cover && (
          <div className="relative h-20 w-full">
            <Image src={cover} alt={l.title} fill className="object-cover" sizes="260px" />
          </div>
        )}
        <div className="p-3">
          <p className="text-xs font-semibold text-gray-800 dark:text-white line-clamp-1 mb-1">{l.title}</p>
          <p className="text-sm font-bold text-[#f95d1e]">{l.price?.toLocaleString()} FCFA</p>
          {nbh?.name && <p className="text-xs text-gray-400 flex items-center gap-0.5 mt-0.5"><MapPin size={9}/>{nbh.name}</p>}
          <button onClick={onViewDetail}
            className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold rounded-lg transition-colors hover:opacity-90">
            <Eye size={11} /> Voir les détails complets
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ListingDetailPanel ────────────────────────────────────────────────────────
function ListingDetailPanel({ listing }: { listing: any }) {
  const nbh = Array.isArray(listing.neighborhood) ? listing.neighborhood[0] : listing.neighborhood
  const city = Array.isArray(nbh?.city) ? nbh?.city[0] : nbh?.city
  const agent = Array.isArray(listing.agent) ? listing.agent[0] : listing.agent
  const medias = listing.media?.sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0)) ?? []
  const amenityLabels: Record<string,string> = {
    wifi:'WiFi', parking:'Parking', security:'Sécurité',
    water_24h:'Eau 24h', electricity:'Électricité',
    generator:'Groupe électrogène', air_conditioning:'Climatisation',
    garden:'Jardin', terrace:'Terrasse',
  }

  return (
    <div className="p-4 space-y-4">
      {/* Galerie photos */}
      {medias.length > 0 && (
        <div className="space-y-1.5">
          <div className="relative h-36 rounded-xl overflow-hidden">
            <Image src={medias[0].url} alt={listing.title} fill className="object-cover" sizes="280px" />
          </div>
          {medias.length > 1 && (
            <div className="grid grid-cols-3 gap-1">
              {medias.slice(1, 4).map((m: any, i: number) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                  <Image src={m.url} alt="" fill className="object-cover" sizes="90px" />
                  {i === 2 && medias.length > 4 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-semibold">
                      +{medias.length - 4}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prix & titre */}
      <div>
        <p className="font-bold text-base text-gray-900 dark:text-white">{listing.title}</p>
        <p className="text-xl font-bold text-[#f95d1e] mt-1">
          {listing.price?.toLocaleString()} FCFA
          {listing.price_negotiable && <span className="text-xs text-gray-400 font-normal ml-1">(négociable)</span>}
        </p>
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          <span className="text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
            {TYPE_LABELS[listing.type] ?? listing.type}
          </span>
          <span className="text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
            {TX_LABELS[listing.transaction] ?? listing.transaction}
          </span>
        </div>
      </div>

      {/* Localisation */}
      <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
        <MapPin size={14} className="mt-0.5 flex-shrink-0 text-[#f95d1e]" />
        <span>{listing.address_hint ?? `${nbh?.name ?? ''}, ${city?.name ?? 'Yaoundé'}`}</span>
      </div>

      {/* Caractéristiques */}
      <div className="grid grid-cols-2 gap-2">
        {listing.bedrooms != null && (
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl p-2.5">
            <BedDouble size={14} className="text-gray-400" />
            <span className="text-xs text-gray-700 dark:text-gray-300">{listing.bedrooms} chambre{listing.bedrooms > 1 ? 's' : ''}</span>
          </div>
        )}
        {listing.bathrooms != null && (
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl p-2.5">
            <Bath size={14} className="text-gray-400" />
            <span className="text-xs text-gray-700 dark:text-gray-300">{listing.bathrooms} SDB</span>
          </div>
        )}
        {listing.surface_m2 != null && (
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl p-2.5">
            <Maximize2 size={14} className="text-gray-400" />
            <span className="text-xs text-gray-700 dark:text-gray-300">{listing.surface_m2} m²</span>
          </div>
        )}
        {listing.floor != null && (
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl p-2.5">
            <Home size={14} className="text-gray-400" />
            <span className="text-xs text-gray-700 dark:text-gray-300">Étage {listing.floor}</span>
          </div>
        )}
      </div>

      {/* Meublé */}
      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium',
        listing.furnished ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-800')}>
        {listing.furnished ? '🛋️ Meublé' : '🏠 Non meublé'}
      </div>

      {/* Équipements */}
      {listing.amenities && Object.entries(listing.amenities).some(([,v]) => v) && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Équipements</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(listing.amenities)
              .filter(([,v]) => v === true)
              .map(([k]) => (
                <span key={k} className="text-[11px] bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                  {amenityLabels[k] ?? k}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Description */}
      {listing.description && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Description</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-4">{listing.description}</p>
        </div>
      )}

      {/* Propriétaire */}
      {(listing.owner_name || listing.owner_phone) && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Propriétaire</p>
          {listing.owner_name && <p className="text-sm text-gray-800 dark:text-white flex items-center gap-1.5"><User size={12}/>{listing.owner_name}</p>}
          {listing.owner_phone && <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5"><Phone size={12}/>{listing.owner_phone}</p>}
        </div>
      )}

      {/* Agent */}
      {agent && (
        <div className="bg-orange-50 dark:bg-orange-950/20 rounded-xl p-3 space-y-1 border border-orange-100 dark:border-orange-900">
          <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide">Agent soumis par</p>
          <p className="text-sm text-gray-800 dark:text-white flex items-center gap-1.5"><User size={12}/>{agent.full_name}</p>
          {agent.phone && <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5"><Phone size={12}/>{agent.phone}</p>}
        </div>
      )}

      {/* Lien externe */}
      {listing.slug && (
        <Link href={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://habynex.com'}/annonces/${listing.slug}`}
          target="_blank"
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <ExternalLink size={14} /> Voir sur Habynex
        </Link>
      )}
    </div>
  )
}
