'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Camera, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Badge, LoadingSpinner } from '@/components/ui/index'
import { formatDate, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

const SC: Record<string,string> = { pending:'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400', active:'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400', suspended:'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400', rejected:'bg-gray-100 text-gray-500 dark:bg-gray-800' }
const SL: Record<string,string> = { pending:'En attente', active:'Actif', suspended:'Suspendu', rejected:'Rejeté' }

export function PhotographesPage() {
  const supabase = createClient()
  const [photographers, setPhotographers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string|null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string|null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('photographers').select(`id,status,missions_completed,id_document_url,selfie_url,validated_at,created_at,profile:profiles!photographers_id_fkey(full_name,phone,avatar_url)`).order('created_at',{ascending:false})
    if (statusFilter) q = q.eq('status',statusFilter)
    const { data } = await q
    setPhotographers(data??[])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function validate(id: string) {
    setProcessing(id)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('photographers').update({ status:'active', validated_by:user?.id, validated_at:new Date().toISOString() }).eq('id',id)
    await supabase.from('user_roles').upsert({ user_id:id, role:'photographer' },{ onConflict:'user_id,role' })
    await supabase.from('notifications').insert({ user_id:id, title:'📸 Candidature photographe acceptée !', body:'Vous êtes photographe certifié Habynex.', channel:'in_app' })
    toast.success('Photographe validé ✅')
    await load(); setProcessing(null)
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) { toast.error('Indiquez la raison'); return }
    setProcessing(id)
    await supabase.from('photographers').update({ status:'rejected', rejection_reason:rejectReason }).eq('id',id)
    await supabase.from('notifications').insert({ user_id:id, title:'Candidature non retenue', body:`Raison : ${rejectReason}`, channel:'in_app' })
    toast('Rejeté',{icon:'ℹ️'}); setRejectReason(''); setExpandedId(null)
    await load(); setProcessing(null)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Photographes" subtitle="Gestion des photographes terrain" />
      <div className="flex gap-2 flex-wrap">
        {[{value:'',label:'Tous'},...Object.entries(SL).map(([v,l])=>({value:v,label:l}))].map(opt=>(
          <button key={opt.value} onClick={()=>setStatusFilter(opt.value)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              statusFilter===opt.value?'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900':'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 bg-white dark:bg-gray-900')}>
            {opt.label}
          </button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {photographers.length===0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800"><Camera size={32} className="text-gray-200 dark:text-gray-700 mx-auto mb-3"/><p className="text-gray-500">Aucun photographe</p></div>
          ) : photographers.map(p=>{
            const profile = Array.isArray(p.profile)?p.profile[0]:p.profile
            const isExp = expandedId===p.id
            return (
              <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                      {profile?.avatar_url ? <Image src={profile.avatar_url} alt="" width={40} height={40} className="object-cover w-full h-full"/> : <div className="w-full h-full flex items-center justify-center text-lg">📸</div>}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-gray-800 dark:text-white">{profile?.full_name??'Photographe'}</p>
                        <Badge label={SL[p.status]??p.status} color={SC[p.status]??''} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        {profile?.phone && <span>📱 {profile.phone}</span>}
                        <span>{p.missions_completed} mission{p.missions_completed>1?'s':''}</span>
                        {p.validated_at && <span>Validé le {formatDate(p.validated_at)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {p.status==='pending' && <button onClick={()=>validate(p.id)} disabled={processing===p.id} className="w-8 h-8 flex items-center justify-center rounded-xl bg-green-100 dark:bg-green-950/30 text-green-600 hover:bg-green-200 transition-colors disabled:opacity-50">{processing===p.id?<Loader2 size={14} className="animate-spin"/>:<CheckCircle2 size={15}/>}</button>}
                    <button onClick={()=>setExpandedId(isExp?null:p.id)} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">{isExp?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
                  </div>
                </div>
                {isExp && (
                  <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4 animate-fade-in">
                    {(p.id_document_url||p.selfie_url) && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documents</p>
                        <div className="flex gap-3 flex-wrap">
                          {p.id_document_url?.split('|||').map((url: string, i: number) => <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-600 hover:underline">📄 {i===0?'CNI Recto':'CNI Verso'}</a>)}
                          {p.selfie_url && <a href={p.selfie_url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-xl text-xs text-purple-600 hover:underline">🤳 Selfie</a>}
                        </div>
                      </div>
                    )}
                    {p.status==='pending' && (
                      <div className="flex gap-3">
                        <button onClick={()=>validate(p.id)} disabled={processing===p.id} className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-2xl text-sm transition-colors disabled:opacity-50"><CheckCircle2 size={15}/>Valider</button>
                        <div className="flex-1 space-y-2">
                          <input value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Raison du rejet…" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 outline-none focus:border-red-400"/>
                          <button onClick={()=>reject(p.id)} disabled={processing===p.id} className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-red-300 dark:border-red-800 text-red-500 font-semibold rounded-xl text-sm hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50"><XCircle size={15}/>Rejeter</button>
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
