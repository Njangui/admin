'use client'
import { useState, useEffect, useRef } from 'react'
import { MessageSquare, Sparkles, UserCheck, Send, Loader2, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Badge, LoadingSpinner } from '@/components/ui/index'
import { timeAgo, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

export function ConversationsAdmin() {
  const supabase = createClient()
  const [convs, setConvs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [filter, setFilter] = useState<'escalated'|'active'|'all'>('escalated')
  const [adminId, setAdminId] = useState<string|null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({data:{user}}) => setAdminId(user?.id??null))
    loadConvs()
  }, [filter])

  useEffect(() => {
    if (!selected) return
    loadMessages(selected.id)
    const ch = supabase.channel(`admin-conv-${selected.id}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${selected.id}`},
        p => setMessages(prev => prev.find(m=>m.id===p.new.id)?prev:[...prev,p.new]))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selected])

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  async function loadConvs() {
    setLoading(true)
    let q = supabase.from('conversations').select(`id,ai_active,escalated_at,escalation_reason,last_message_at,unread_count,created_at,client:profiles!conversations_client_id_fkey(full_name,phone),listing:listings!conversations_listing_id_fkey(title,slug)`).order('last_message_at',{ascending:false}).limit(50)
    if (filter==='escalated') q = q.not('escalated_to','is',null)
    if (filter==='active') q = q.eq('ai_active',true)
    const { data } = await q
    setConvs(data??[])
    setLoading(false)
  }

  async function loadMessages(id: string) {
    setMsgLoading(true)
    const { data } = await supabase.from('messages').select('id,role,content,sender_id,created_at').eq('conversation_id',id).order('created_at',{ascending:true}).limit(80)
    setMessages(data??[])
    setMsgLoading(false)
    await supabase.from('conversations').update({unread_count:0}).eq('id',id)
  }

  async function sendReply() {
    if (!reply.trim()||!selected||!adminId) return
    setSending(true)
    await supabase.from('messages').insert({ conversation_id:selected.id, sender_id:adminId, role:'admin', content:reply.trim() })
    if (selected.escalated_at) await supabase.from('conversations').update({ai_active:false}).eq('id',selected.id)
    setReply(''); setSending(false)
  }

  async function takeOver(id: string) {
    if (!adminId) return
    await supabase.from('conversations').update({ ai_active:false, escalated_to:adminId, escalated_at:new Date().toISOString(), escalation_reason:'Prise en main admin' }).eq('id',id)
    toast.success('Conversation prise en main')
    await loadConvs()
    setSelected((prev:any) => prev?.id===id ? {...prev,ai_active:false,escalated_at:new Date().toISOString()} : prev)
  }

  async function handBackToAI(id: string) {
    await supabase.from('conversations').update({ ai_active:true, escalated_to:null, escalated_at:null, escalation_reason:null }).eq('id',id)
    toast.success('Rendue à l\'IA')
    await loadConvs()
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Conversations" subtitle="Messagerie client — IA et escalades" />
      <div className="flex gap-2">
        {[{v:'escalated',l:'🚨 Escaladées'},{v:'active',l:'🤖 IA active'},{v:'all',l:'Toutes'}].map(opt=>(
          <button key={opt.v} onClick={()=>setFilter(opt.v as any)} className={cn('px-4 py-2 rounded-xl text-sm font-medium border transition-all',filter===opt.v?'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900':'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 bg-white dark:bg-gray-900')}>{opt.l}</button>
        ))}
      </div>
      <div className="flex h-[calc(100vh-280px)] bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {/* Liste */}
        <div className={cn('flex flex-col border-r border-gray-100 dark:border-gray-800', selected?'hidden md:flex md:w-80':'flex-1 md:w-80')}>
          {loading ? <LoadingSpinner /> : convs.length===0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-gray-400"><MessageSquare size={32} className="mb-2"/><p className="text-sm">Aucune conversation</p></div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {convs.map(conv=>{
                const client = Array.isArray(conv.client)?conv.client[0]:conv.client
                const listing = Array.isArray(conv.listing)?conv.listing[0]:conv.listing
                return (
                  <button key={conv.id} onClick={()=>setSelected(conv)} className={cn('w-full flex gap-3 px-4 py-3.5 border-b border-gray-50 dark:border-gray-800/50 text-left hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors',selected?.id===conv.id&&'bg-orange-50/60 dark:bg-orange-950/10')}>
                    <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm',conv.escalated_at?'bg-red-100 dark:bg-red-950/30':'bg-blue-100 dark:bg-blue-950/30')}>
                      {conv.ai_active?'🤖':conv.escalated_at?'🚨':'👤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{client?.full_name??'Client'}</p>
                        {conv.last_message_at && <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(conv.last_message_at)}</span>}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{listing?.title??'—'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {conv.escalated_at && <span className="text-[10px] text-red-500 font-medium">Escaladée</span>}
                        {conv.ai_active && <span className="text-[10px] text-blue-500 font-medium flex items-center gap-0.5"><Sparkles size={9}/>IA</span>}
                        {(conv.unread_count??0)>0 && <span className="ml-auto min-w-[16px] h-4 bg-[#f95d1e] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">{conv.unread_count}</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {/* Chat */}
        {selected ? (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-gray-800">
              <button onClick={()=>setSelected(null)} className="md:hidden w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><ArrowLeft size={16}/></button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-gray-800 dark:text-white truncate">{(Array.isArray(selected.client)?selected.client[0]:selected.client)?.full_name??'Client'}</p>
                  {selected.escalated_at ? <Badge label="🚨 Escaladée" color="bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400"/> : selected.ai_active ? <Badge label="🤖 IA active" color="bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"/> : <Badge label="👤 Admin" color="bg-gray-100 text-gray-600 dark:bg-gray-800"/>}
                </div>
                <p className="text-xs text-gray-400 truncate">{(Array.isArray(selected.listing)?selected.listing[0]:selected.listing)?.title??'—'}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {selected.ai_active ? (
                  <button onClick={()=>takeOver(selected.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f95d1e] hover:bg-[#e84e0f] text-white text-xs font-semibold rounded-xl transition-colors"><UserCheck size={12}/>Prendre en main</button>
                ) : (
                  <button onClick={()=>handBackToAI(selected.id)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"><Sparkles size={12}/>Rendre à l&apos;IA</button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {msgLoading ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400"/></div>
              : messages.map(msg=>{
                const isUser = msg.role==='user'
                const isAI = msg.role==='ai'
                return (
                  <div key={msg.id} className={cn('flex gap-2 items-end',isUser?'flex-row':'flex-row-reverse')}>
                    <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0',isAI?'bg-blue-100 dark:bg-blue-950':msg.role==='admin'?'bg-[#f95d1e]/10':'bg-gray-100 dark:bg-gray-800')}>{isAI?'🤖':msg.role==='admin'?'👤':'💬'}</div>
                    <div className={cn('max-w-[72%] rounded-2xl px-4 py-2.5 text-sm',isUser?'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white rounded-bl-sm':isAI?'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 rounded-br-sm':'bg-[#f95d1e] text-white rounded-br-sm')}>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      <p className={cn('text-[10px] mt-1 text-right',isUser?'text-gray-400':isAI?'text-blue-400':'text-white/60')}>{timeAgo(msg.created_at)}</p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef}/>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">
              <input value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendReply()}}} placeholder="Répondre en tant qu'admin…" className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-white bg-white dark:bg-gray-800 outline-none focus:border-gray-400 transition-colors"/>
              <button onClick={sendReply} disabled={!reply.trim()||sending} className="w-10 h-10 bg-[#f95d1e] hover:bg-[#e84e0f] disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
                {sending?<Loader2 size={15} className="animate-spin"/>:<Send size={15}/>}
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center flex-col text-gray-400 gap-2">
            <MessageSquare size={40} className="text-gray-200 dark:text-gray-700"/>
            <p className="text-sm">Sélectionnez une conversation</p>
          </div>
        )}
      </div>
    </div>
  )
}
