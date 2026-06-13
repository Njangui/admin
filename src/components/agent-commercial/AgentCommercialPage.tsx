'use client'
import { useState, useEffect, useRef } from 'react'
import {
  Bot, Play, Pause, Square, Send, Loader2, AlertTriangle, MessageSquare,
  TrendingUp, Users, FileText, Settings as SettingsIcon, Sparkles, ExternalLink,
  CheckCircle2, XCircle, Clock, ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, LoadingSpinner, StatCard, Badge, ActionButton } from '@/components/ui/index'
import { cn, timeAgo, formatDate } from '@/lib/utils/index'
import toast from 'react-hot-toast'

type AgentStatus = 'running' | 'paused' | 'stopped'

interface AgentConfig {
  id: number
  status: AgentStatus
  max_comments_per_day: number
  max_dm_per_day: number
  max_posts_per_day: number
  min_delay_seconds: number
  max_delay_seconds: number
  active_hours_start: string
  active_hours_end: string
  target_groups: { name: string; url: string; enabled: boolean }[]
  custom_instructions: string
  whatsapp_link: string
  website_link: string
  last_run_at: string | null
  last_heartbeat_at: string | null
  last_error: string | null
  paused_reason: string | null
}

interface AgentLog {
  id: string
  action_type: string
  status: string
  group_name: string | null
  target_name: string | null
  content: string | null
  source_text: string | null
  error_message: string | null
  created_at: string
}

interface DailyStats {
  date: string
  comments_count: number
  dm_count: number
  posts_count: number
  scans_count: number
  errors_count: number
  leads_detected: number
}

interface Lead {
  id: string
  fb_profile_name: string
  fb_profile_url: string | null
  group_name: string | null
  post_text: string | null
  intent: string | null
  contact_status: string
  contacted_at: string | null
  message_sent: string | null
  created_at: string
}

interface AgentMessage {
  id: string
  sender: 'admin' | 'agent'
  content: string
  is_instruction: boolean
  applied: boolean
  created_at: string
}

interface WeeklyReport {
  id: string
  week_start: string
  week_end: string
  content: string | null
  stats: any
  recommendations: { type: string; title: string; description: string; priority: string }[] | null
  generated_at: string
}

const TABS = [
  { key: 'overview', label: "Vue d'ensemble", icon: TrendingUp },
  { key: 'activity', label: 'Activité', icon: Clock },
  { key: 'leads', label: 'Prospects', icon: Users },
  { key: 'chat', label: 'Instructions & Chat', icon: MessageSquare },
  { key: 'reports', label: 'Rapports hebdo', icon: FileText },
  { key: 'settings', label: 'Paramètres', icon: SettingsIcon },
] as const

const STATUS_LABEL: Record<AgentStatus, string> = {
  running: 'En activité',
  paused: 'En pause',
  stopped: 'Arrêté',
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  running: 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400',
  paused: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  stopped: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

export function AgentCommercialPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<typeof TABS[number]['key']>('overview')
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [weekTotals, setWeekTotals] = useState({ comments: 0, dm: 0, posts: 0, leads: 0 })
  const [leads, setLeads] = useState<Lead[]>([])
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    load()
    const interval = setInterval(() => {
      loadConfig()
      loadLogs()
      loadStats()
    }, 20000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (tab === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, tab])

  async function load() {
    setLoading(true)
    await Promise.all([loadConfig(), loadLogs(), loadStats(), loadLeads(), loadMessages(), loadReports()])
    setLoading(false)
  }

  async function loadConfig() {
    const { data } = await supabase.from('commercial_agent_config').select('*').eq('id', 1).single()
    if (data) setConfig(data as AgentConfig)
  }

  async function loadLogs() {
    const { data } = await supabase.from('commercial_agent_logs').select('*').order('created_at', { ascending: false }).limit(50)
    setLogs((data ?? []) as AgentLog[])
  }

  async function loadStats() {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('commercial_agent_daily_stats').select('*').eq('date', today).maybeSingle()
    setStats(data as DailyStats ?? { date: today, comments_count: 0, dm_count: 0, posts_count: 0, scans_count: 0, errors_count: 0, leads_detected: 0 })

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const { data: week } = await supabase.from('commercial_agent_daily_stats').select('*').gte('date', weekAgo)
    const totals = (week ?? []).reduce((acc, d: any) => ({
      comments: acc.comments + d.comments_count, dm: acc.dm + d.dm_count,
      posts: acc.posts + d.posts_count, leads: acc.leads + d.leads_detected,
    }), { comments: 0, dm: 0, posts: 0, leads: 0 })
    setWeekTotals(totals)
  }

  async function loadLeads() {
    const { data } = await supabase.from('commercial_agent_leads').select('*').order('created_at', { ascending: false }).limit(50)
    setLeads((data ?? []) as Lead[])
  }

  async function loadMessages() {
    const { data } = await supabase.from('commercial_agent_messages').select('*').order('created_at', { ascending: true }).limit(200)
    setMessages((data ?? []) as AgentMessage[])
  }

  async function loadReports() {
    const { data } = await supabase.from('commercial_agent_weekly_reports').select('*').order('week_start', { ascending: false }).limit(20)
    const list = (data ?? []) as WeeklyReport[]
    setReports(list)
    if (list.length > 0 && !selectedReport) setSelectedReport(list[0])
  }

  async function setAgentStatus(status: AgentStatus, reason?: string) {
    if (!config) return
    setActionLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('commercial_agent_config').update({
        status, paused_reason: reason ?? null, updated_by: user?.id ?? null,
      }).eq('id', 1)
      await supabase.from('commercial_agent_logs').insert({
        action_type: status === 'running' ? (config.status === 'paused' ? 'resume' : 'start') : status === 'paused' ? 'pause' : 'stop',
        status: 'success', content: reason ?? null,
      })
      toast.success(status === 'running' ? 'Agent relancé' : status === 'paused' ? 'Agent mis en pause' : 'Agent arrêté')
      await loadConfig()
      await loadLogs()
    } catch {
      toast.error('Erreur lors du changement de statut')
    } finally {
      setActionLoading(false)
    }
  }

  async function saveConfig(partial: Partial<AgentConfig>) {
    if (!config) return
    setActionLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('commercial_agent_config').update({ ...partial, updated_by: user?.id ?? null }).eq('id', 1)
      if (error) throw error
      toast.success('Paramètres enregistrés')
      await loadConfig()
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setActionLoading(false)
    }
  }

  async function sendChatMessage() {
    if (!chatInput.trim()) return
    setSendingChat(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('commercial_agent_messages').insert({
        sender: 'admin', admin_id: user?.id ?? null, content: chatInput.trim(), is_instruction: true,
      })
      setChatInput('')
      await loadMessages()
      toast.success('Message envoyé à l\'agent')
    } catch {
      toast.error('Erreur lors de l\'envoi')
    } finally {
      setSendingChat(false)
    }
  }

  async function updateLeadStatus(id: string, contact_status: string) {
    await supabase.from('commercial_agent_leads').update({ contact_status }).eq('id', id)
    await loadLeads()
  }

  if (loading || !config) return <LoadingSpinner />

  const isOnline = config.last_heartbeat_at && (Date.now() - new Date(config.last_heartbeat_at).getTime()) < 5 * 60000

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agent Commercial Facebook"
        subtitle="Prospection automatique sur les groupes immobilier Facebook au Cameroun"
        action={
          <div className="flex items-center gap-2">
            <ActionButton label="Pause" icon={Pause} variant="secondary" size="sm"
              disabled={actionLoading || config.status !== 'running'}
              onClick={() => setAgentStatus('paused', 'Mis en pause manuellement')} />
            <ActionButton label="Relancer" icon={Play} variant="primary" size="sm"
              disabled={actionLoading || config.status === 'running'}
              onClick={() => setAgentStatus('running')} />
            <ActionButton label="Arrêter" icon={Square} variant="danger" size="sm"
              disabled={actionLoading || config.status === 'stopped'}
              onClick={() => setAgentStatus('stopped', 'Arrêté manuellement')} />
          </div>
        }
      />

      {/* Bandeau de statut */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#f95d1e]/10 flex items-center justify-center flex-shrink-0">
          <Bot size={24} className="text-[#f95d1e]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge label={STATUS_LABEL[config.status]} color={STATUS_COLOR[config.status]} />
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', isOnline ? 'text-green-500' : 'text-gray-400')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', isOnline ? 'bg-green-500' : 'bg-gray-300')} />
              {isOnline ? 'Worker connecté' : 'Worker hors-ligne'}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Dernière action : {config.last_run_at ? timeAgo(config.last_run_at) : 'jamais'}
            {config.paused_reason && <> · Raison : {config.paused_reason}</>}
          </p>
          {config.last_error && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle size={12}/> {config.last_error}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-gray-100 dark:border-gray-800">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              tab === t.key ? 'border-[#f95d1e] text-[#f95d1e]' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Commentaires aujourd'hui" value={`${stats?.comments_count ?? 0} / ${config.max_comments_per_day}`} icon={MessageSquare} color="bg-blue-500" />
            <StatCard title="Messages privés aujourd'hui" value={`${stats?.dm_count ?? 0} / ${config.max_dm_per_day}`} icon={Send} color="bg-purple-500" />
            <StatCard title="Publications aujourd'hui" value={`${stats?.posts_count ?? 0} / ${config.max_posts_per_day}`} icon={Sparkles} color="bg-[#f95d1e]" />
            <StatCard title="Prospects détectés (7j)" value={weekTotals.leads} icon={Users} color="bg-green-500" sub={`${weekTotals.comments} commentaires · ${weekTotals.dm} MP cette semaine`} />
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">Groupes Facebook surveillés</h3>
            {config.target_groups.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun groupe configuré — ajoutez-en dans l'onglet Paramètres.</p>
            ) : (
              <div className="space-y-2">
                {config.target_groups.map((g, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', g.enabled ? 'bg-green-500' : 'bg-gray-300')} />
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{g.name}</span>
                    </div>
                    <a href={g.url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#f95d1e] flex-shrink-0">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">Activité récente</h3>
            <LogList logs={logs.slice(0, 8)} />
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">Journal complet</h3>
          <LogList logs={logs} />
        </div>
      )}

      {tab === 'leads' && (
        <div className="space-y-3">
          {leads.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
              <Users size={28} className="text-gray-200 dark:text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Aucun prospect détecté pour l'instant</p>
            </div>
          ) : leads.map(lead => (
            <div key={lead.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{lead.fb_profile_name}</p>
                    {lead.fb_profile_url && (
                      <a href={lead.fb_profile_url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#f95d1e]">
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{lead.group_name} · {timeAgo(lead.created_at)}</p>
                </div>
                <select value={lead.contact_status} onChange={e => updateLeadStatus(lead.id, e.target.value)}
                  className="text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1 text-gray-600 dark:text-gray-300">
                  <option value="pending">En attente</option>
                  <option value="contacted">Contacté</option>
                  <option value="replied">A répondu</option>
                  <option value="converted">Converti</option>
                  <option value="ignored">Ignoré</option>
                </select>
              </div>
              {lead.intent && <p className="text-sm text-gray-700 dark:text-gray-300 mb-1"><span className="font-medium">Recherche :</span> {lead.intent}</p>}
              {lead.post_text && <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 mb-1">"{lead.post_text}"</p>}
              {lead.message_sent && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1"><span className="font-medium text-green-600 dark:text-green-400">Réponse envoyée :</span> {lead.message_sent}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'chat' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col h-[600px]">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-800 dark:text-white">Discuter avec l'agent</p>
            <p className="text-xs text-gray-400 mt-0.5">Donnez des instructions, posez des questions, demandez un rapport. L'agent lit ces messages et y répond.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare size={28} className="text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Aucun message — écrivez à votre agent ci-dessous</p>
              </div>
            ) : messages.map(m => (
              <div key={m.id} className={cn('flex', m.sender === 'admin' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[75%] rounded-2xl px-4 py-2.5 text-sm',
                  m.sender === 'admin' ? 'bg-[#f95d1e] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200')}>
                  {m.sender === 'agent' && <p className="text-[10px] font-semibold uppercase tracking-wide text-[#f95d1e] mb-1">Agent</p>}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <p className={cn('text-[10px] mt-1', m.sender === 'admin' ? 'text-white/60' : 'text-gray-400')}>{timeAgo(m.created_at)}{m.is_instruction && m.applied && ' · appliqué ✓'}</p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() } }}
              placeholder="Ex: Concentre-toi sur les studios à Bastos cette semaine, et ralentis les MP..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[#f95d1e]/30" />
            <ActionButton label="Envoyer" icon={sendingChat ? Loader2 : Send} onClick={sendChatMessage} disabled={sendingChat || !chatInput.trim()} />
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="grid lg:grid-cols-[260px_1fr] gap-5">
          <div className="space-y-2">
            {reports.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                <FileText size={28} className="text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Aucun rapport encore</p>
              </div>
            ) : reports.map(r => (
              <button key={r.id} onClick={() => setSelectedReport(r)}
                className={cn('w-full text-left px-4 py-3.5 rounded-2xl border transition-all',
                  selectedReport?.id === r.id ? 'bg-[#f95d1e]/8 border-[#f95d1e]/30 dark:bg-[#f95d1e]/10' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700')}>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">
                  {formatDate(r.week_start, { day: 'numeric', month: 'short' })} – {formatDate(r.week_end, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Généré {timeAgo(r.generated_at)}</p>
              </button>
            ))}
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            {!selectedReport ? (
              <p className="text-sm text-gray-400">Sélectionnez un rapport</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Rapport du {formatDate(selectedReport.week_start, { day: 'numeric', month: 'long' })} au {formatDate(selectedReport.week_end, { day: 'numeric', month: 'long', year: 'numeric' })}
                  </h3>
                </div>
                {selectedReport.stats && Object.keys(selectedReport.stats).length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(selectedReport.stats).map(([k, v]) => (
                      <div key={k} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                        <p className="text-xs text-gray-400">{k}</p>
                        <p className="text-lg font-bold text-gray-800 dark:text-white">{String(v)}</p>
                      </div>
                    ))}
                  </div>
                )}
                {selectedReport.content && (
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                    {selectedReport.content}
                  </div>
                )}
                {selectedReport.recommendations && selectedReport.recommendations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-white mb-2 flex items-center gap-1.5"><Sparkles size={14} className="text-[#f95d1e]" /> Suggestions d'amélioration</h4>
                    <div className="space-y-2">
                      {selectedReport.recommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                          <Badge label={rec.priority} color={rec.priority === 'high' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' : rec.priority === 'medium' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'} />
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-white">{rec.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{rec.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <SettingsTab config={config} onSave={saveConfig} loading={actionLoading} />
      )}
    </div>
  )
}

function LogList({ logs }: { logs: AgentLog[] }) {
  if (logs.length === 0) return <p className="text-sm text-gray-400">Aucune activité enregistrée</p>
  const ICONS: Record<string, any> = {
    comment: MessageSquare, dm: Send, post: Sparkles, scan: Clock,
    error: XCircle, info: ChevronRight, pause: Pause, resume: Play, stop: Square, start: Play,
  }
  const LABELS: Record<string, string> = {
    comment: 'Commentaire publié', dm: 'Message privé envoyé', post: 'Annonce publiée',
    scan: 'Scan d\'un groupe', error: 'Erreur', info: 'Info',
    pause: 'Mise en pause', resume: 'Reprise', stop: 'Arrêt', start: 'Démarrage',
  }
  return (
    <div className="space-y-2">
      {logs.map(log => {
        const Icon = ICONS[log.action_type] ?? ChevronRight
        return (
          <div key={log.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/50">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
              log.status === 'failed' ? 'bg-red-50 text-red-500 dark:bg-red-500/10' : log.status === 'skipped' ? 'bg-gray-100 text-gray-400 dark:bg-gray-700' : 'bg-[#f95d1e]/10 text-[#f95d1e]')}>
              <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-800 dark:text-white">{LABELS[log.action_type] ?? log.action_type}</p>
                <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(log.created_at)}</span>
              </div>
              {log.group_name && <p className="text-xs text-gray-500 dark:text-gray-400">Groupe : {log.group_name}{log.target_name && ` · Cible : ${log.target_name}`}</p>}
              {log.content && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{log.content}</p>}
              {log.error_message && <p className="text-xs text-red-500 mt-0.5">{log.error_message}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SettingsTab({ config, onSave, loading }: { config: AgentConfig; onSave: (p: Partial<AgentConfig>) => void; loading: boolean }) {
  const [form, setForm] = useState({
    max_comments_per_day: config.max_comments_per_day,
    max_dm_per_day: config.max_dm_per_day,
    max_posts_per_day: config.max_posts_per_day,
    min_delay_seconds: config.min_delay_seconds,
    max_delay_seconds: config.max_delay_seconds,
    active_hours_start: config.active_hours_start,
    active_hours_end: config.active_hours_end,
    custom_instructions: config.custom_instructions,
    whatsapp_link: config.whatsapp_link,
    website_link: config.website_link,
  })
  const [groups, setGroups] = useState(config.target_groups)
  const [newGroup, setNewGroup] = useState({ name: '', url: '' })

  function addGroup() {
    if (!newGroup.name || !newGroup.url) return
    setGroups([...groups, { ...newGroup, enabled: true }])
    setNewGroup({ name: '', url: '' })
  }

  function removeGroup(i: number) {
    setGroups(groups.filter((_, idx) => idx !== i))
  }

  function toggleGroup(i: number) {
    setGroups(groups.map((g, idx) => idx === i ? { ...g, enabled: !g.enabled } : g))
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">Limites quotidiennes (anti-suspension Facebook)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Commentaires / jour" value={form.max_comments_per_day} onChange={v => setForm({ ...form, max_comments_per_day: v })} />
          <Field label="Messages privés / jour" value={form.max_dm_per_day} onChange={v => setForm({ ...form, max_dm_per_day: v })} />
          <Field label="Publications / jour" value={form.max_posts_per_day} onChange={v => setForm({ ...form, max_posts_per_day: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Délai minimum entre actions (sec)" value={form.min_delay_seconds} onChange={v => setForm({ ...form, min_delay_seconds: v })} />
          <Field label="Délai maximum entre actions (sec)" value={form.max_delay_seconds} onChange={v => setForm({ ...form, max_delay_seconds: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Heure de début d'activité</label>
            <input type="time" value={form.active_hours_start} onChange={e => setForm({ ...form, active_hours_start: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Heure de fin d'activité</label>
            <input type="time" value={form.active_hours_end} onChange={e => setForm({ ...form, active_hours_end: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">Groupes Facebook ciblés</h3>
        <div className="space-y-2 mb-3">
          {groups.map((g, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <button onClick={() => toggleGroup(i)} className={cn('w-9 h-5 rounded-full transition-colors relative flex-shrink-0', g.enabled ? 'bg-[#f95d1e]' : 'bg-gray-300 dark:bg-gray-600')}>
                <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', g.enabled ? 'translate-x-4' : 'translate-x-0.5')} />
              </button>
              <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{g.name}</span>
              <a href={g.url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#f95d1e]"><ExternalLink size={14} /></a>
              <button onClick={() => removeGroup(i)} className="text-gray-400 hover:text-red-500"><XCircle size={14} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input placeholder="Nom du groupe" value={newGroup.name} onChange={e => setNewGroup({ ...newGroup, name: e.target.value })}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          <input placeholder="URL du groupe Facebook" value={newGroup.url} onChange={e => setNewGroup({ ...newGroup, url: e.target.value })}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          <ActionButton label="Ajouter" variant="secondary" size="sm" onClick={addGroup} />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">Redirection des prospects</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Lien WhatsApp Habynex</label>
            <input value={form.whatsapp_link} onChange={e => setForm({ ...form, whatsapp_link: e.target.value })} placeholder="https://wa.me/237..."
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Site web Habynex</label>
            <input value={form.website_link} onChange={e => setForm({ ...form, website_link: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-2">Instructions personnalisées pour l'agent</h3>
        <p className="text-xs text-gray-400 mb-3">Ce texte est ajouté au prompt de l'agent : ton à adopter, priorités, biens à mettre en avant, choses à éviter...</p>
        <textarea value={form.custom_instructions} onChange={e => setForm({ ...form, custom_instructions: e.target.value })} rows={5}
          placeholder="Ex: Privilégie les biens à Bastos, Omnisport et Mvan. Ne mentionne jamais de prix exact en commentaire, redirige toujours vers WhatsApp. Ton chaleureux et concis."
          className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent text-sm resize-none" />
      </div>

      <div className="flex justify-end">
        <ActionButton label="Enregistrer les paramètres" icon={loading ? Loader2 : CheckCircle2} loading={loading}
          onClick={() => onSave({ ...form, target_groups: groups })} />
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{label}</label>
      <input type="number" min={0} value={value} onChange={e => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
    </div>
  )
}
