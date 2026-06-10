'use client'
import { useState, useEffect } from 'react'
import { Sparkles, RefreshCw, Loader2, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, LoadingSpinner } from '@/components/ui/index'
import { formatDate, formatPrice, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

export function RapportsPage() {
  const supabase = createClient()
  const [reports, setReports] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('daily_reports').select('*').order('report_date',{ascending:false}).limit(30)
    const list = data ?? []
    setReports(list)
    if (list.length > 0 && !selected) setSelected(list[0])
    setLoading(false)
  }

  async function generateNow() {
    setGenerating(true)
    try {
      const res = await fetch('/api/cron/daily-report', { method: 'POST', headers: { 'x-cron-secret': process.env.NEXT_PUBLIC_CRON_SECRET ?? '' } })
      if (!res.ok) throw new Error()
      toast.success('Rapport généré ✅')
      await load()
    } catch { toast.error('Erreur lors de la génération') }
    finally { setGenerating(false) }
  }

  useEffect(() => {
    if (!selected) return
    async function markRead() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const alreadyRead = selected.read_by?.includes(user.id)
      if (!alreadyRead) {
        await supabase.from('daily_reports').update({ read_by: [...(selected.read_by ?? []), user.id] }).eq('id', selected.id)
      }
    }
    markRead()
  }, [selected])

  return (
    <div className="space-y-5">
      <PageHeader title="Rapports IA" subtitle="Rapports quotidiens générés automatiquement à 22h"
        action={
          <button onClick={generateNow} disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
            {generating ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            Générer maintenant
          </button>
        }
      />
      {loading ? <LoadingSpinner /> : (
        <div className="grid lg:grid-cols-[260px_1fr] gap-5">
          {/* Liste rapports */}
          <div className="space-y-2">
            {reports.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                <FileText size={28} className="text-gray-200 dark:text-gray-700 mx-auto mb-2"/>
                <p className="text-sm text-gray-400">Aucun rapport</p>
              </div>
            ) : reports.map(r => (
              <button key={r.id} onClick={() => setSelected(r)}
                className={cn('w-full text-left px-4 py-3.5 rounded-2xl border transition-all',
                  selected?.id===r.id ? 'bg-[#f95d1e]/8 border-[#f95d1e]/30 dark:bg-[#f95d1e]/10' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700')}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">
                    {formatDate(r.report_date, { day:'numeric', month:'long', year:'numeric' })}
                  </p>
                  <Sparkles size={13} className="text-[#f95d1e]"/>
                </div>
                {r.kpi_snapshot && (
                  <div className="flex gap-3 text-xs text-gray-400">
                    <span>+{r.kpi_snapshot.new_users??0} users</span>
                    <span>{r.kpi_snapshot.bookings??0} RDV</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Détail */}
          {selected ? (
            <div className="space-y-5">
              {selected.kpi_snapshot && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    ['👤','Nouveaux users', selected.kpi_snapshot.new_users??0],
                    ['💬','Messages', selected.kpi_snapshot.messages_sent??0],
                    ['📅','Réservations', selected.kpi_snapshot.bookings??0],
                    ['🏠','Annonces publiées', selected.kpi_snapshot.published_listings??0],
                    ['✅','Visites effectuées', selected.kpi_snapshot.visits_completed??0],
                    ['💰','Revenu estimé', formatPrice(selected.kpi_snapshot.revenue_estimate??0,true)],
                  ].map(([icon,label,val]) => (
                    <div key={String(label)} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                      <div className="text-2xl mb-1">{icon}</div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{val}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={16} className="text-[#f95d1e]"/>
                  <h2 className="font-semibold text-gray-900 dark:text-white">Analyse IA</h2>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-2">
                  {selected.content.split('\n').map((line: string, i: number) => <p key={i}>{line}</p>)}
                </div>
              </div>
              {selected.suggestions?.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
                  <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Suggestions d&apos;actions</h2>
                  <div className="space-y-3">
                    {selected.suggestions.map((s: any, i: number) => (
                      <div key={i} className={cn('p-4 rounded-2xl border', {
                        'bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900': s.priority==='high',
                        'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900': s.priority==='medium',
                        'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700': s.priority==='low',
                      })}>
                        <div className="flex items-start gap-2">
                          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0', {
                            'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400': s.priority==='high',
                            'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400': s.priority==='medium',
                            'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400': s.priority==='low',
                          })}>
                            {s.priority==='high'?'🔴 Urgent':s.priority==='medium'?'🟡 Normal':'🟢 Faible'}
                          </span>
                          <div>
                            <p className="font-semibold text-sm text-gray-800 dark:text-white">{s.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 py-20">
              <div className="text-center text-gray-400">
                <FileText size={36} className="mx-auto mb-3 text-gray-200 dark:text-gray-700"/>
                <p className="text-sm">Sélectionnez un rapport</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
