'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sparkles, RefreshCw, Loader2, FileText, ChevronDown, ChevronUp, Star, MapPin, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, LoadingSpinner, Badge } from '@/components/ui/index'
import { formatDate, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

interface FieldReport {
  id: string
  agent_id: string
  report_date: string
  mission_count: number
  successful_missions: number
  neighborhoods_covered: string[]
  client_feedback: string
  issues_encountered: string
  suggestions: string
  mood_score: number           // 1-5 : satisfaction de la journée
  transport_mode: string
  submitted_at: string
  ai_analysis: string | null
  profile?: { full_name: string | null; phone: string | null }
  role_type?: 'agent' | 'photographer'
}

const MOOD_LABELS = ['', '😞 Difficile', '😐 Moyen', '😊 Correct', '😄 Bien', '🌟 Excellent']
const MOOD_COLORS = ['', 'text-red-500', 'text-orange-500', 'text-yellow-500', 'text-green-500', 'text-emerald-500']

export function RapportsTerrainPage() {
  const supabase = createClient()
  const [reports, setReports] = useState<FieldReport[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [globalAnalysis, setGlobalAnalysis] = useState<string | null>(null)
  const [analyzingGlobal, setAnalyzingGlobal] = useState(false)
  const [dateFilter, setDateFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('field_reports').select(`
      id, agent_id, report_date, mission_count, successful_missions,
      neighborhoods_covered, client_feedback, issues_encountered,
      suggestions, mood_score, transport_mode, submitted_at, ai_analysis, role_type,
      profile:profiles!field_reports_agent_id_fkey(full_name, phone)
    `).order('submitted_at', { ascending: false }).limit(100)
    if (dateFilter) q = q.eq('report_date', dateFilter)
    const { data } = await q
    setReports(data ?? [])
    setLoading(false)
  }, [dateFilter])

  useEffect(() => { load() }, [load])

  async function analyzeReport(report: FieldReport) {
    setAnalyzing(report.id)
    try {
      const res = await fetch('/api/field-report/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id, report }),
      })
      if (!res.ok) throw new Error()
      toast.success('Analyse IA générée ✅')
      await load()
    } catch {
      toast.error('Erreur analyse IA')
    } finally {
      setAnalyzing(null)
    }
  }

  async function generateGlobalAnalysis() {
    if (reports.length === 0) { toast.error('Aucun rapport à analyser'); return }
    setAnalyzingGlobal(true)
    try {
      const res = await fetch('/api/field-report/global-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reports: reports.slice(0, 20), date: dateFilter || new Date().toISOString().split('T')[0] }),
      })
      const data = await res.json()
      setGlobalAnalysis(data.analysis)
    } catch {
      toast.error('Erreur analyse globale')
    } finally {
      setAnalyzingGlobal(false)
    }
  }

  // KPIs agrégés
  const totalMissions = reports.reduce((s, r) => s + (r.mission_count ?? 0), 0)
  const successMissions = reports.reduce((s, r) => s + (r.successful_missions ?? 0), 0)
  const avgMood = reports.length > 0 ? (reports.reduce((s, r) => s + (r.mood_score ?? 3), 0) / reports.length).toFixed(1) : '—'
  const successRate = totalMissions > 0 ? Math.round((successMissions / totalMissions) * 100) : 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rapports terrain"
        subtitle="Rapports quotidiens soumis par les agents et photographes"
        action={
          <button onClick={generateGlobalAnalysis} disabled={analyzingGlobal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {analyzingGlobal ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Analyse IA globale
          </button>
        }
      />

      {/* Filtre date */}
      <div className="flex items-center gap-3">
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 outline-none focus:border-[#f95d1e]" />
        {dateFilter && (
          <button onClick={() => setDateFilter('')}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Effacer le filtre</button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Rapports reçus', value: reports.length, color: 'text-blue-600' },
          { label: 'Missions totales', value: totalMissions, color: 'text-purple-600' },
          { label: 'Taux de succès', value: `${successRate}%`, color: 'text-green-600' },
          { label: 'Moral moyen', value: avgMood + '/5', color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 text-center">
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Analyse globale IA */}
      {globalAnalysis && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-[#f95d1e]" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Analyse IA — Synthèse terrain</h2>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-2">
            {globalAnalysis.split('\n').map((line, i) => <p key={i}>{line}</p>)}
          </div>
        </div>
      )}

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
              <FileText size={36} className="text-gray-200 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500">Aucun rapport terrain reçu</p>
              <p className="text-xs text-gray-400 mt-1">Les agents et photographes soumettent leurs rapports depuis leur dashboard</p>
            </div>
          ) : reports.map(r => {
            const profile = Array.isArray(r.profile) ? r.profile[0] : r.profile
            const isExp = expandedId === r.id
            const successPct = r.mission_count > 0 ? Math.round((r.successful_missions / r.mission_count) * 100) : 0

            return (
              <div key={r.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-sm text-gray-800 dark:text-white">{profile?.full_name ?? 'Prestataire'}</p>
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                        r.role_type === 'photographer'
                          ? 'bg-purple-100 text-purple-600 dark:bg-purple-950/30'
                          : 'bg-blue-100 text-blue-600 dark:bg-blue-950/30')}>
                        {r.role_type === 'photographer' ? '📷 Photographe' : '👤 Agent'}
                      </span>
                      {r.mood_score && (
                        <span className={cn('text-xs font-medium', MOOD_COLORS[r.mood_score])}>
                          {MOOD_LABELS[r.mood_score]}
                        </span>
                      )}
                      {r.ai_analysis && (
                        <span className="text-xs text-[#f95d1e] font-medium flex items-center gap-0.5">
                          <Sparkles size={10} /> Analysé
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Clock size={11} />{formatDate(r.report_date, { day: 'numeric', month: 'short' })}</span>
                      <span>{r.mission_count} mission{r.mission_count > 1 ? 's' : ''} · <strong className="text-green-600">{r.successful_missions} succès</strong> ({successPct}%)</span>
                      {r.neighborhoods_covered?.length > 0 && (
                        <span className="flex items-center gap-1"><MapPin size={11} />{r.neighborhoods_covered.slice(0, 2).join(', ')}{r.neighborhoods_covered.length > 2 ? '…' : ''}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!r.ai_analysis && (
                      <button onClick={() => analyzeReport(r)} disabled={analyzing === r.id}
                        className="px-3 py-1.5 bg-[#f95d1e]/10 hover:bg-[#f95d1e]/20 text-[#f95d1e] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50">
                        {analyzing === r.id ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                        Analyser
                      </button>
                    )}
                    <button onClick={() => setExpandedId(isExp ? null : r.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {isExp && (
                  <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4 animate-fade-in">
                    <div className="grid sm:grid-cols-2 gap-4">
                      {r.client_feedback && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Retours clients</p>
                          <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">{r.client_feedback}</p>
                        </div>
                      )}
                      {r.issues_encountered && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Problèmes rencontrés</p>
                          <p className="text-sm text-gray-600 dark:text-gray-300 bg-amber-50 dark:bg-amber-950/20 rounded-xl px-3 py-2">{r.issues_encountered}</p>
                        </div>
                      )}
                      {r.suggestions && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Suggestions</p>
                          <p className="text-sm text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-950/20 rounded-xl px-3 py-2">{r.suggestions}</p>
                        </div>
                      )}
                      {r.transport_mode && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Transport utilisé</p>
                          <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">{r.transport_mode}</p>
                        </div>
                      )}
                    </div>

                    {r.ai_analysis && (
                      <div className="bg-[#f95d1e]/5 dark:bg-[#f95d1e]/10 border border-[#f95d1e]/20 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles size={14} className="text-[#f95d1e]" />
                          <p className="text-xs font-semibold text-[#f95d1e] uppercase tracking-wide">Analyse IA</p>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{r.ai_analysis}</p>
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
