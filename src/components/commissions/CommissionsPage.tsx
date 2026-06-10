'use client'
import { useState, useEffect, useCallback } from 'react'
import { DollarSign, ChevronDown, ChevronUp, CheckCircle2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Badge, LoadingSpinner } from '@/components/ui/index'
import { formatPrice, formatDate, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

const SL: Record<string,string> = { pending:'En attente', due:'À collecter', collected:'Collectée', paid_agent:'Agent payé' }
const SC: Record<string,string> = { pending:'bg-gray-100 text-gray-500 dark:bg-gray-800', due:'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400', collected:'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400', paid_agent:'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' }

export function CommissionsPage() {
  const supabase = createClient()
  const [commissions, setCommissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string|null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('commissions').select(`id,status,commission_model,property_price,total_commission,agent_amount,taxi_allowance,habynex_amount,owner_paid,tenant_paid,agent_paid,notes,created_at,agent:agents!commissions_agent_id_fkey(profile:profiles!agents_id_fkey(full_name,phone)),listing:listings!commissions_listing_id_fkey(title,slug)`).order('created_at',{ascending:false})
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data } = await q
    setCommissions(data??[])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function updateField(id: string, field: string, value: boolean) {
    setProcessing(id)
    const comm = commissions.find(c=>c.id===id)
    const update: Record<string,unknown> = { [field]: value }
    if (field==='owner_paid' && comm?.tenant_paid) update.status = 'collected'
    if (field==='tenant_paid' && comm?.owner_paid) update.status = 'collected'
    if (field==='agent_paid' && value) { update.status = 'paid_agent'; update.agent_paid_at = new Date().toISOString() }
    await supabase.from('commissions').update(update).eq('id',id)
    toast.success('Mis à jour ✅'); await load(); setProcessing(null)
  }

  async function saveAmounts(id: string, agentAmount: number, taxiAllowance: number) {
    setProcessing(id)
    await supabase.from('commissions').update({ agent_amount:agentAmount, taxi_allowance:taxiAllowance, status:'due' }).eq('id',id)
    toast.success('Montants mis à jour ✅'); await load(); setProcessing(null)
  }

  const totalDue = commissions.filter(c=>c.status==='due').reduce((s,c)=>s+c.total_commission,0)
  const totalCollected = commissions.filter(c=>c.status==='collected').reduce((s,c)=>s+c.habynex_amount,0)

  return (
    <div className="space-y-5">
      <PageHeader title="Commissions" subtitle="Suivi des commissions agents et Habynex" />
      <div className="grid grid-cols-3 gap-4">
        {[{label:'À collecter',value:formatPrice(totalDue,true),color:'text-amber-600'},{label:'Collecté (Habynex)',value:formatPrice(totalCollected,true),color:'text-green-600'},{label:'Total commissions',value:commissions.length,color:'text-blue-600'}].map(s=>(
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 text-center">
            <p className={cn('text-xl font-bold',s.color)}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        {[{value:'',label:'Toutes'},...Object.entries(SL).map(([v,l])=>({value:v,label:l}))].map(opt=>(
          <button key={opt.value} onClick={()=>setStatusFilter(opt.value)} className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-all', statusFilter===opt.value?'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900':'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 bg-white dark:bg-gray-900')}>{opt.label}</button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {commissions.length===0 ? <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800"><DollarSign size={32} className="text-gray-200 dark:text-gray-700 mx-auto mb-3"/><p className="text-gray-500">Aucune commission</p></div>
          : commissions.map(c=>{
            const agentProfile = Array.isArray(c.agent)?c.agent[0]?.profile:c.agent?.profile
            const ap = Array.isArray(agentProfile)?agentProfile[0]:agentProfile
            const listing = Array.isArray(c.listing)?c.listing[0]:c.listing
            const isExp = expandedId===c.id
            return (
              <div key={c.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-sm text-gray-800 dark:text-white truncate max-w-[200px]">{listing?.title??'Bien inconnu'}</p>
                      <Badge label={SL[c.status]??c.status} color={SC[c.status]??''} />
                      <span className="text-xs text-gray-400">Modèle {c.commission_model}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                      <span>Agent: <strong className="text-gray-600 dark:text-gray-300">{ap?.full_name??'—'}</strong></span>
                      <span>Total: <strong className="text-green-600">{formatPrice(c.total_commission,true)}</strong></span>
                      <span>Agent: <strong className="text-blue-600">{formatPrice(c.agent_amount+c.taxi_allowance,true)}</strong></span>
                      <span>Habynex: <strong className="text-[#f95d1e]">{formatPrice(c.habynex_amount,true)}</strong></span>
                    </div>
                    <div className="flex gap-2 mt-1.5">
                      {[{f:'owner_paid',l:'Proprio',v:c.owner_paid},{f:'tenant_paid',l:'Locataire',v:c.tenant_paid},{f:'agent_paid',l:'Agent payé',v:c.agent_paid}].map(item=>(
                        <span key={item.f} className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full',item.v?'bg-green-100 text-green-600 dark:bg-green-950/30':'bg-gray-100 text-gray-400 dark:bg-gray-800')}>{item.v?'✓':'○'} {item.l}</span>
                      ))}
                    </div>
                  </div>
                  <button onClick={()=>setExpandedId(isExp?null:c.id)} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">{isExp?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
                </div>
                {isExp && (
                  <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4 animate-fade-in">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Modifier les montants</p>
                      <div className="grid grid-cols-2 gap-3 mb-2">
                        <div><label className="text-xs text-gray-400 mb-1 block">Commission agent (FCFA)</label><input type="number" id={`amt-${c.id}`} defaultValue={c.agent_amount} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 outline-none"/></div>
                        <div><label className="text-xs text-gray-400 mb-1 block">Taxi (FCFA)</label><input type="number" id={`taxi-${c.id}`} defaultValue={c.taxi_allowance} disabled={c.commission_model==='B'} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 outline-none disabled:opacity-40"/></div>
                      </div>
                      <button disabled={processing===c.id} onClick={()=>{const a=document.getElementById(`amt-${c.id}`) as HTMLInputElement;const t=document.getElementById(`taxi-${c.id}`) as HTMLInputElement;saveAmounts(c.id,+a.value,+t.value)}} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-xs font-semibold hover:opacity-90 disabled:opacity-50">{processing===c.id?<Loader2 size={12} className="animate-spin"/>:<CheckCircle2 size={12}/>}Valider les montants</button>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Suivi paiements</p>
                      <div className="space-y-2">
                        {[{f:'owner_paid',l:`Propriétaire payé (${formatPrice(c.total_commission/2,true)})`,v:c.owner_paid},{f:'tenant_paid',l:`Locataire payé (${formatPrice(c.total_commission/2,true)})`,v:c.tenant_paid},{f:'agent_paid',l:`Agent payé (${formatPrice(c.agent_amount+c.taxi_allowance,true)})`,v:c.agent_paid}].map(item=>(
                          <label key={item.f} className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={item.v} onChange={()=>updateField(c.id,item.f,!item.v)} className="w-4 h-4 accent-[#f95d1e] cursor-pointer"/>
                            <span className={cn('text-sm',item.v?'line-through text-gray-400':'text-gray-700 dark:text-gray-300')}>{item.l}</span>
                          </label>
                        ))}
                      </div>
                    </div>
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
