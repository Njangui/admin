'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { UserCheck, Phone, Calendar, ChevronDown, ChevronUp, Loader2, MapPin, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Badge, LoadingSpinner } from '@/components/ui/index'
import { formatPrice, formatDate, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

const STATUS_LABELS: Record<string,string> = {
  pending_verification:'À vérifier', pending_payment:'En attente paiement',
  paid:'Payée', scheduled:'Planifiée',
  confirmed:'Confirmée', reminder_sent:'Rappel envoyé', completed:'Effectuée',
  cancelled:'Annulée', refunded:'Remboursée'
}
const STATUS_COLORS: Record<string,string> = {
  pending_verification:'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  pending_payment:'bg-gray-100 text-gray-500 dark:bg-gray-800',
  paid:'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  scheduled:'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
  confirmed:'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  reminder_sent:'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400',
  completed:'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  cancelled:'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  refunded:'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400'
}

export function ReservationsPage() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [bookings, setBookings] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string|null>(null)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '')
  const [expandedId, setExpandedId] = useState<string|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('visit_bookings').select(`
      id,status,scheduled_at,nb_listings,amount_paid,is_free,
      payment_method,payment_ref,paid_at,agent_id,outcome,
      chosen_listing_id,admin_notes,reminder_24h_sent,
      refunded,refund_reason,created_at,listing_ids,
      client:profiles!visit_bookings_client_id_fkey(full_name,phone,avatar_url),
      agent:agents!visit_bookings_agent_id_fkey(profile:profiles!agents_id_fkey(full_name,phone))
    `).order('created_at', { ascending: false }).limit(100)
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data } = await q
    setBookings(data ?? [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.from('agents')
      .select('id,profile:profiles!agents_id_fkey(full_name,phone)')
      .eq('status', 'active')
      .then(({ data }) => setAgents(data ?? []))
  }, [])

  async function assignAgent(bookingId: string, agentId: string) {
    setProcessing(bookingId)
    const booking = bookings.find(b => b.id === bookingId)
    await supabase.from('visit_bookings').update({
      agent_id: agentId, status: 'scheduled'
    }).eq('id', bookingId)
    const agent = agents.find(a => a.id === agentId)
    const agentName = (Array.isArray(agent?.profile) ? agent.profile[0] : agent?.profile)?.full_name ?? 'l\'agent'
    // Notifier l'agent (in_app)
    await supabase.from('notifications').insert({
      user_id: agentId,
      title: '📅 Nouvelle mission assignée',
      body: `Vous avez une mission de ${booking?.nb_listings ?? 1} bien(s) à visiter.`,
      action_url: '/agent-dashboard',
      channel: 'in_app'
    })
    // Notifier le client
    if (booking?.client_id) {
      await supabase.from('notifications').insert({
        user_id: booking.client_id,
        title: '✅ Votre visite est planifiée',
        body: `Un agent a été assigné à votre demande de visite.`,
        action_url: '/profil',
        channel: 'in_app'
      })
    }
    toast.success(`Assigné à ${agentName} ✅`)
    await load(); setProcessing(null)
  }

  async function markCompleted(bookingId: string, outcome: 'success' | 'failure') {
    setProcessing(bookingId)
    await supabase.from('visit_bookings').update({
      status: 'completed', outcome
    }).eq('id', bookingId)
    // Mettre à jour les stats agent
    const booking = bookings.find(b => b.id === bookingId)
    if (booking?.agent_id) {
      const { data: agent } = await supabase.from('agents').select('missions_completed').eq('id', booking.agent_id).single()
      if (agent) {
        await supabase.from('agents').update({ missions_completed: (agent.missions_completed ?? 0) + 1 }).eq('id', booking.agent_id)
      }
    }
    toast.success('Visite marquée comme effectuée ✅')
    await load(); setProcessing(null)
  }

  async function verifyPayment(bookingId: string) {
    if (!confirm('Confirmer ce paiement MoMo et passer la réservation à "Payée" ?')) return
    setProcessing(bookingId)
    const booking = bookings.find(b => b.id === bookingId)
    await supabase.from('visit_bookings').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', bookingId)

    // Notifier le client
    if (booking?.client_id) {
      await supabase.from('notifications').insert({
        user_id:    booking.client_id,
        title:      '✅ Paiement confirmé !',
        body:       `Votre réservation de ${booking.nb_listings} visite(s) est confirmée. Un agent va vous être assigné.`,
        action_url: '/profil?tab=visites',
        channel:    'in_app',
      })
    }
    toast.success('Paiement confirmé ✅')
    await load(); setProcessing(null)
  }

  async function rejectPayment(bookingId: string) {
    const reason = prompt('Raison du rejet (ex: référence invalide, montant incorrect) :')
    if (reason === null) return
    setProcessing(bookingId)
    const booking = bookings.find(b => b.id === bookingId)
    await supabase.from('visit_bookings').update({
      status:        'cancelled',
      refund_reason: reason || 'Paiement non vérifié',
    }).eq('id', bookingId)

    // Notifier le client
    if (booking?.client_id) {
      await supabase.from('notifications').insert({
        user_id:    booking.client_id,
        title:      '❌ Paiement non confirmé',
        body:       `Votre paiement n'a pas pu être vérifié${reason ? ` : ${reason}` : ''}. Contactez-nous si besoin.`,
        action_url: '/profil?tab=visites',
        channel:    'in_app',
      })
    }
    toast.success('Réservation rejetée')
    await load(); setProcessing(null)
  }

  async function handleRefund(bookingId: string) {
    if (!confirm('Confirmer le remboursement ?')) return
    setProcessing(bookingId)
    const booking = bookings.find(b => b.id === bookingId)
    const { data: { user: admin } } = await supabase.auth.getUser()
    await supabase.from('visit_bookings').update({
      status: 'refunded',
      refunded: true,
      refund_reason: 'Remboursement admin',
      refunded_at: new Date().toISOString(),
      refunded_by: admin?.id ?? null,
    }).eq('id', bookingId)
    // Restituer la visite gratuite si c'était une visite gratuite — via la
    // fonction RPC atomique (pas de select+update séparés qui pourraient
    // se chevaucher avec une autre opération sur le même solde).
    if (booking?.is_free && booking?.client_id) {
      await supabase.rpc('increment_free_visits', { user_id: booking.client_id })
    }
    toast.success('Remboursement enregistré — pensez à reverser l\'argent au client en MoMo si le paiement était payant.')
    await load(); setProcessing(null)
  }

  async function scheduleDate(bookingId: string, date: string) {
    setProcessing(bookingId)
    await supabase.from('visit_bookings').update({
      scheduled_at: new Date(date).toISOString(), status: 'confirmed'
    }).eq('id', bookingId)
    const booking = bookings.find(b => b.id === bookingId)
    if (booking?.client_id) {
      await supabase.from('notifications').insert({
        user_id: booking.client_id,
        title: '📅 Date de visite confirmée',
        body: `Votre visite est confirmée pour le ${formatDate(date, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`,
        action_url: '/profil',
        channel: 'in_app'
      })
    }
    toast.success('Date confirmée ✅')
    await load(); setProcessing(null)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Réservations" subtitle="Gestion des visites terrain" />
      <div className="flex gap-2 flex-wrap">
        {[{ value:'', label:'Toutes' }, ...Object.entries(STATUS_LABELS).map(([v,l]) => ({ value:v, label:l }))].map(opt => (
          <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              statusFilter === opt.value ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 bg-white dark:bg-gray-900')}>
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {bookings.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
              <p className="text-4xl mb-3">📭</p><p className="text-gray-500">Aucune réservation</p>
            </div>
          ) : bookings.map(b => {
            const client = Array.isArray(b.client) ? b.client[0] : b.client
            const agentProfile = Array.isArray(b.agent) ? b.agent[0]?.profile : b.agent?.profile
            const agentProfileData = Array.isArray(agentProfile) ? agentProfile[0] : agentProfile
            const isExpanded = expandedId === b.id
            return (
              <div key={b.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge label={STATUS_LABELS[b.status] ?? b.status} color={STATUS_COLORS[b.status] ?? ''} />
                      {b.is_free && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400">Gratuite</span>}
                      {b.payment_method && <span className="text-xs text-gray-400 uppercase">{b.payment_method}</span>}
                    </div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">
                      {client?.full_name ?? '—'} · {b.nb_listings} bien{b.nb_listings > 1 ? 's' : ''}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                      {client?.phone && <span className="flex items-center gap-1"><Phone size={11}/>{client.phone}</span>}
                      {b.scheduled_at && <span className="flex items-center gap-1"><Calendar size={11}/>{formatDate(b.scheduled_at, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>}
                      {agentProfileData && <span className="flex items-center gap-1"><UserCheck size={11}/>Agent: {agentProfileData.full_name}</span>}
                      <span className="font-medium text-gray-600 dark:text-gray-300">{formatPrice(b.amount_paid, true)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {b.outcome && (
                      <span className={cn('text-xs font-semibold', b.outcome === 'success' ? 'text-green-500' : 'text-red-500')}>
                        {b.outcome === 'success' ? '✅ Succès' : '❌ Échec'}
                      </span>
                    )}
                    <button onClick={() => setExpandedId(isExpanded ? null : b.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      {isExpanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4">
                    {/* ── Vérification paiement MoMo ── */}
                    {b.status === 'pending_verification' && (
                      <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 space-y-3">
                        <p className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                          Vérification paiement MoMo
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-400">Opérateur</span>
                            <p className="font-bold text-gray-800 dark:text-white uppercase mt-0.5">
                              {b.payment_method === 'mtn' ? '🟡 MTN MoMo' : b.payment_method === 'orange' ? '🟠 Orange Money' : b.payment_method ?? '—'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-400">Montant attendu</span>
                            <p className="font-bold text-gray-800 dark:text-white mt-0.5">{formatPrice(b.amount_paid, true)}</p>
                          </div>
                        </div>
                        {b.payment_ref && (
                          <div>
                            <span className="text-xs text-gray-400">Référence client</span>
                            <p className="font-mono font-bold text-sm text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/40 px-3 py-2 rounded-xl mt-1 tracking-widest">
                              {b.payment_ref}
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-gray-400">
                          Vérifiez dans votre application {b.payment_method?.toUpperCase()} que vous avez bien reçu {formatPrice(b.amount_paid, true)} avec cette référence.
                        </p>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => verifyPayment(b.id)}
                            disabled={processing === b.id}
                            className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors">
                            {processing === b.id ? <Loader2 size={13} className="animate-spin"/> : <CheckCircle2 size={13}/>}
                            Confirmer le paiement
                          </button>
                          <button
                            onClick={() => rejectPayment(b.id)}
                            disabled={processing === b.id}
                            className="flex-1 py-2.5 border-2 border-red-300 dark:border-red-800 text-red-500 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 transition-colors">
                            <AlertCircle size={13}/>
                            Rejeter
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Info paiement */}
                    {b.payment_ref && b.status !== 'pending_verification' && (
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-xs text-gray-500">
                        Réf. paiement: <span className="font-mono text-gray-700 dark:text-gray-300">{b.payment_ref}</span>
                        {b.paid_at && <span> · Payé le {formatDate(b.paid_at)}</span>}
                      </div>
                    )}

                    {/* Assigner un agent */}
                    {(b.status === 'paid' || b.status === 'scheduled') && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          {b.agent_id ? 'Réassigner l\'agent' : 'Assigner un agent'}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {agents.map(a => {
                            const ap = Array.isArray(a.profile) ? a.profile[0] : a.profile
                            return (
                              <button key={a.id} onClick={() => assignAgent(b.id, a.id)}
                                disabled={processing === b.id}
                                className={cn('px-3 py-2 rounded-xl text-xs font-medium border transition-all hover:shadow-sm disabled:opacity-50',
                                  b.agent_id === a.id ? 'bg-[#f95d1e] text-white border-[#f95d1e]' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400')}>
                                {processing === b.id ? <Loader2 size={12} className="animate-spin"/> : (ap?.full_name ?? a.id.slice(0,8))}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Planifier date */}
                    {(b.status === 'scheduled') && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Confirmer la date</p>
                        <div className="flex gap-2">
                          <input type="datetime-local"
                            defaultValue={b.scheduled_at ? b.scheduled_at.slice(0,16) : ''}
                            id={`date-${b.id}`}
                            className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 outline-none focus:border-[#f95d1e]" />
                          <button
                            onClick={() => {
                              const input = document.getElementById(`date-${b.id}`) as HTMLInputElement
                              if (input?.value) scheduleDate(b.id, input.value)
                            }}
                            disabled={processing === b.id}
                            className="px-3 py-2 bg-[#f95d1e] text-white rounded-xl text-xs font-semibold hover:bg-[#e04f15] disabled:opacity-50 flex items-center gap-1">
                            {processing === b.id ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={13}/>}
                            Confirmer
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Résultat visite */}
                    {b.status === 'confirmed' && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Résultat de la visite</p>
                        <div className="flex gap-2">
                          <button onClick={() => markCompleted(b.id, 'success')} disabled={processing === b.id}
                            className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1 disabled:opacity-50">
                            <CheckCircle2 size={13}/> Succès
                          </button>
                          <button onClick={() => markCompleted(b.id, 'failure')} disabled={processing === b.id}
                            className="flex-1 py-2.5 border-2 border-red-300 dark:border-red-800 text-red-500 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50">
                            <AlertCircle size={13}/> Échec
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Remboursement */}
                    {(b.status === 'paid' || b.status === 'scheduled') && !b.refunded && (
                      <button onClick={() => handleRefund(b.id)} disabled={processing === b.id}
                        className="w-full py-2 border border-gray-200 dark:border-gray-700 text-gray-500 text-xs font-medium rounded-xl hover:border-red-300 hover:text-red-500 transition-colors disabled:opacity-50">
                        Rembourser
                      </button>
                    )}

                    {/* Notes admin */}
                    {b.admin_notes && (
                      <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                        📝 {b.admin_notes}
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
