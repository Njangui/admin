'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Star, MapPin, Phone, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Badge, LoadingSpinner } from '@/components/ui/index'
import { formatDate, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

const SC: Record<string,string> = { pending:'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400', reviewing:'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400', active:'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400', suspended:'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400', rejected:'bg-gray-100 text-gray-500 dark:bg-gray-800' }
const SL: Record<string,string> = { pending:'En attente', reviewing:'En cours', active:'Actif', suspended:'Suspendu', rejected:'Rejeté' }

export function AgentsPage() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string|null>(null)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '')
  const [expandedId, setExpandedId] = useState<string|null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('agents').select(`id,status,commission_model,ai_score,id_document_url,selfie_url,application_answers,missions_completed,created_at,neighborhood_id,profile:profiles!agents_id_fkey(full_name,phone,avatar_url),neighborhood:neighborhoods!agents_neighborhood_id_fkey(name)`).order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data } = await q
    setAgents(data ?? [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function validate(id: string) {
    setProcessing(id)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('agents').update({ status:'active', validated_by:user?.id, validated_at:new Date().toISOString() }).eq('id',id)
    await supabase.from('user_roles').upsert({ user_id:id, role:'agent' }, { onConflict:'user_id,role' })
    await supabase.from('notifications').insert({ user_id:id, title:'🎉 Candidature acceptée !', body:'Vous êtes maintenant agent certifié Habynex.', channel:'in_app' })
    toast.success('Agent validé ✅'); await load(); setProcessing(null)
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) { toast.error('Indiquez la raison'); return }
    setProcessing(id)
    await supabase.from('agents').update({ status:'rejected', rejection_reason:rejectReason }).eq('id',id)
    await supabase.from('notifications').insert({ user_id:id, title:'Candidature non retenue', body:`Raison : ${rejectReason}`, channel:'in_app' })
    toast('Rejeté et notifié', { icon:'ℹ️' }); setRejectReason(''); setExpandedId(null); await load(); setProcessing(null)
  }

  async function suspend(id: string) {
    await supabase.from('agents').update({ status:'suspended' }).eq('id',id)
    await supabase.from('user_roles').delete().eq('user_id',id).eq('role','agent')
    toast('Agent suspendu', { icon:'⚠️' }); await load()
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Agents" subtitle="Gestion des agents terrain" />
      <div className="flex gap-2 flex-wrap">
        {[{ value:'', label:'Tous' }, ...Object.entries(SL).map(([v,l]) => ({ value:v, label:l }))].map(opt => (
          <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              statusFilter===opt.value ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 bg-white dark:bg-gray-900')}>
            {opt.label}
          </button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {agents.length === 0 ? <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800"><p className="text-4xl mb-3">👤</p><p className="text-gray-500">Aucun agent</p></div>
          : agents.map(a => {
            const p = Array.isArray(a.profile) ? a.profile[0] : a.profile
            const n = Array.isArray(a.neighborhood) ? a.neighborhood[0] : a.neighborhood
            const isExp = expandedId === a.id
            return (
              <div key={a.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                      {p?.avatar_url ? <Image src={p.avatar_url} alt="" width={40} height={40} className="object-cover w-full h-full"/> : <div className="w-full h-full flex items-center justify-center font-bold text-gray-400">{p?.full_name?.charAt(0)??'?'}</div>}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-gray-800 dark:text-white">{p?.full_name??'Agent'}</p>
                        <Badge label={SL[a.status]??a.status} color={SC[a.status]??''} />
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', a.commission_model==='A'?'bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400':'bg-purple-100 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400')}>Modèle {a.commission_model}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        {p?.phone && <span className="flex items-center gap-1"><Phone size={11}/>{p.phone}</span>}
                        {n && <span className="flex items-center gap-1"><MapPin size={11}/>{n.name}</span>}
                        {a.ai_score!==null && <span className="flex items-center gap-1 text-amber-500"><Star size={11}/>Score IA: {a.ai_score}/10</span>}
                        <span>{a.missions_completed} mission{a.missions_completed>1?'s':''}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {a.status==='pending' && <button onClick={() => validate(a.id)} disabled={processing===a.id} className="w-8 h-8 flex items-center justify-center rounded-xl bg-green-100 dark:bg-green-950/30 text-green-600 hover:bg-green-200 transition-colors disabled:opacity-50">{processing===a.id?<Loader2 size={14} className="animate-spin"/>:<CheckCircle2 size={15}/>}</button>}
                    {a.status==='active' && <button onClick={() => suspend(a.id)} className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-500 text-xs font-semibold hover:bg-red-100 transition-colors">Suspendre</button>}
                    <button onClick={() => setExpandedId(isExp?null:a.id)} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">{isExp?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
                  </div>
                </div>
                {isExp && (
                  <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4 animate-fade-in">
                    {a.application_answers && Object.keys(a.application_answers).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Réponses questionnaire</p>
                        <div className="space-y-2">
                          {Object.entries(a.application_answers).map(([k,v]) => (
                            <div key={k} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                              <p className="text-xs text-gray-400 capitalize mb-0.5">{k.replace('_',' ')}</p>
                              <p className="text-sm text-gray-700 dark:text-gray-300">{String(v)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(a.id_document_url||a.selfie_url) && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documents</p>
                        <div className="flex gap-3 flex-wrap">
                          {a.id_document_url?.split('|||').map((url: string, i: number) => <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-600 dark:text-blue-400 hover:underline">📄 {i===0?'CNI Recto':'CNI Verso'}</a>)}
                          {a.selfie_url && <a href={a.selfie_url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-xl text-xs text-purple-600 dark:text-purple-400 hover:underline">🤳 Selfie</a>}
                        </div>
                      </div>
                    )}
                    {(a.status==='pending'||a.status==='reviewing') && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Décision</p>
                        <div className="flex gap-3">
                          <button onClick={() => validate(a.id)} disabled={processing===a.id} className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-2xl text-sm transition-colors disabled:opacity-50"><CheckCircle2 size={15}/>Valider</button>
                          <div className="flex-1 space-y-2">
                            <input value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Raison du rejet…" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 outline-none focus:border-red-400"/>
                            <button onClick={() => reject(a.id)} disabled={processing===a.id} className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-red-300 dark:border-red-800 text-red-500 font-semibold rounded-xl text-sm hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50"><XCircle size={15}/>Rejeter</button>
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
