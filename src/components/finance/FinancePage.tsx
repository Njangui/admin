'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard, Users,
  Calendar, ArrowUpRight, ArrowDownRight, Download, RefreshCw,
  BarChart3, PieChart, Wallet, Building2, Target, Zap,
  Plus, Trash2, Save, AlertTriangle, CheckCircle2, Edit3,
  Package, X, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner, PageHeader } from '@/components/ui/index'
import { formatDate, cn } from '@/lib/utils/index'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

interface FinanceSnapshot {
  visitRevenue: { total: number; thisMonth: number; lastMonth: number; count: number }
  commissions: {
    totalCollected: number; thisMonth: number; lastMonth: number
    totalDue: number; duePending: number; agentsPaid: number; habynexNet: number
  }
  totalRevenue: number; totalRevenueThisMonth: number; totalRevenueLastMonth: number
  agentsActive: number; avgRevenuePerAgent: number
  visitsCompleted: number; visitsTotal: number; visitSuccessRate: number
  freeVisits: number; paidVisits: number
  monthlyRevenue: MonthlyRevenue[]
  topAgents: TopAgent[]
  recentTransactions: Transaction[]
}

interface MonthlyRevenue {
  month: string; label: string; visits: number; commissions: number; total: number
}
interface TopAgent {
  id: string; name: string; missionsCompleted: number; totalCommission: number; successRate: number
}
interface Transaction {
  id: string; type: 'visit' | 'commission'; label: string; amount: number; status: string; date: string
}

// Budget annuel Habynex
interface AnnualBudget {
  id?: string
  year: number
  budget: number           // Budget total de l'année
  notes?: string
  created_at?: string
  updated_at?: string
}

// Dépense
interface Expense {
  id?: string
  date: string             // ISO date
  category: string         // catégorie de dépense
  label: string            // description
  amount: number           // montant FCFA
  paid_by?: string         // qui a payé
  receipt_url?: string     // lien justificatif
  created_at?: string
}

const EXPENSE_CATEGORIES = [
  { value: 'salaire', label: '👤 Salaires & RH', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400' },
  { value: 'marketing', label: '📣 Marketing & Pub', color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400' },
  { value: 'tech', label: '💻 Technologie & Hosting', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400' },
  { value: 'transport', label: '🚗 Transport & Déplacement', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400' },
  { value: 'bureau', label: '🏢 Bureau & Fournitures', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  { value: 'juridique', label: '⚖️ Juridique & Administratif', color: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400' },
  { value: 'formation', label: '📚 Formation & Développement', color: 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400' },
  { value: 'autre', label: '📌 Autre', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
]

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function fmt(n: number, compact = false): string {
  if (compact && n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (compact && n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return n.toLocaleString('fr-FR')
}
function fmtFcfa(n: number, compact = false): string {
  return `${fmt(n, compact)} FCFA`
}
function growthPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}
function getCategoryStyle(value: string) {
  return EXPENSE_CATEGORIES.find(c => c.value === value)?.color ?? 'bg-gray-100 text-gray-600'
}
function getCategoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find(c => c.value === value)?.label ?? value
}

// ─────────────────────────────────────────
// COMPOSANTS UI LOCAUX
// ─────────────────────────────────────────

function KpiCard({ title, value, sub, icon: Icon, color, growth }: {
  title: string; value: string; sub?: string
  icon: React.ElementType; color: string; growth?: number
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
          <Icon size={18} className="text-white" />
        </div>
        {growth !== undefined && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full',
            growth >= 0
              ? 'bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400'
              : 'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400'
          )}>
            {growth >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(growth)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mb-0.5">{value}</p>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon size={15} className="text-white dark:text-gray-900" />
      </div>
      <div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

function RevenueBarChart({ data }: { data: MonthlyRevenue[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const maxVal = Math.max(...data.map(d => d.total), 1)
  const W = 600; const H = 160; const padL = 8; const padR = 8; const padT = 16; const padB = 36
  const chartW = W - padL - padR; const chartH = H - padT - padB
  const barW = Math.floor(chartW / data.length) - 4
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }}>
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const y = padT + chartH * (1 - t)
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
              {t > 0 && <text x={padL} y={y - 3} fontSize={8} fill="currentColor" opacity={0.3}>{fmtFcfa(maxVal * t, true)}</text>}
            </g>
          )
        })}
        {data.map((d, i) => {
          const x = padL + i * (chartW / data.length) + 2
          const visitH = (d.visits / maxVal) * chartH
          const commH = (d.commissions / maxVal) * chartH
          const totalH = (d.total / maxVal) * chartH
          const isHov = hovered === i
          return (
            <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} className="cursor-pointer">
              <rect x={x} y={padT + chartH - visitH} width={barW * 0.45} height={visitH} rx={3} fill="#f95d1e" opacity={isHov ? 1 : 0.8} />
              <rect x={x + barW * 0.5} y={padT + chartH - commH} width={barW * 0.45} height={commH} rx={3} fill="#10b981" opacity={isHov ? 1 : 0.8} />
              {isHov && (
                <g>
                  <rect x={x - 10} y={padT + chartH - totalH - 44} width={90} height={40} rx={6} fill="#111827" opacity={0.95} />
                  <text x={x + 35} y={padT + chartH - totalH - 28} textAnchor="middle" fontSize={9} fill="white" fontWeight="bold">{fmtFcfa(d.total, true)}</text>
                  <text x={x + 35} y={padT + chartH - totalH - 16} textAnchor="middle" fontSize={8} fill="#9ca3af">{d.label}</text>
                </g>
              )}
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={8.5} fill="currentColor" opacity={isHov ? 1 : 0.45} fontWeight={isHov ? 'bold' : 'normal'}>{d.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="flex items-center gap-4 mt-2 px-2">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#f95d1e] inline-block" /><span className="text-xs text-gray-400">Visites</span></div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /><span className="text-xs text-gray-400">Commissions</span></div>
      </div>
    </div>
  )
}

function DonutChart({ slices, size = 120 }: { slices: { label: string; value: number; color: string }[]; size?: number }) {
  const total = slices.reduce((s, d) => s + d.value, 0)
  const r = 42; const cx = size / 2; const cy = size / 2
  let cumAngle = -Math.PI / 2
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => {
          if (s.value === 0) return null
          const angle = (s.value / total) * 2 * Math.PI
          const x1 = cx + r * Math.cos(cumAngle); const y1 = cy + r * Math.sin(cumAngle)
          cumAngle += angle
          const x2 = cx + r * Math.cos(cumAngle); const y2 = cy + r * Math.sin(cumAngle)
          const large = angle > Math.PI ? 1 : 0
          return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={s.color} stroke="white" strokeWidth={2} />
        })}
        <circle cx={cx} cy={cy} r={28} fill="white" className="dark:fill-gray-900" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill="currentColor">{fmt(total, true)}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize={7} fill="currentColor" opacity={0.5}>FCFA</text>
      </svg>
      <div className="space-y-2">
        {slices.map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{s.label}</span>
            <span className="text-xs font-bold text-gray-800 dark:text-white ml-auto pl-4">{fmtFcfa(s.value, true)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// BUDGET ANNUEL — Composant
// ─────────────────────────────────────────

function BudgetSection({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const supabase = createClient()
  const currentYear = new Date().getFullYear()
  const [budget, setBudget] = useState<AnnualBudget | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')
  const [budgetNotes, setBudgetNotes] = useState('')
  const [savingBudget, setSavingBudget] = useState(false)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [savingExpense, setSavingExpense] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: 'autre',
    label: '',
    amount: '',
    paid_by: '',
  })
  const [yearFilter, setYearFilter] = useState(currentYear)

  useEffect(() => { loadBudgetData() }, [yearFilter])

  async function loadBudgetData() {
    setLoading(true)

    // Budget annuel
    const { data: budgetData } = await supabase
      .from('company_budget')
      .select('*')
      .eq('year', yearFilter)
      .single()

    setBudget(budgetData ?? null)
    setBudgetInput(budgetData?.budget ? String(budgetData.budget) : '')
    setBudgetNotes(budgetData?.notes ?? '')

    // Dépenses de l'année
    const startOfYear = `${yearFilter}-01-01`
    const endOfYear = `${yearFilter}-12-31`
    const { data: expenseData } = await supabase
      .from('company_expenses')
      .select('*')
      .gte('date', startOfYear)
      .lte('date', endOfYear)
      .order('date', { ascending: false })

    setExpenses(expenseData ?? [])
    setLoading(false)
  }

  async function saveBudget() {
    if (!budgetInput || isNaN(Number(budgetInput))) return
    setSavingBudget(true)
    const payload = { year: yearFilter, budget: Number(budgetInput), notes: budgetNotes }
    if (budget?.id) {
      await supabase.from('company_budget').update(payload).eq('id', budget.id)
    } else {
      await supabase.from('company_budget').insert(payload)
    }
    await loadBudgetData()
    setEditingBudget(false)
    setSavingBudget(false)
  }

  async function addExpense() {
    if (!expenseForm.label || !expenseForm.amount || isNaN(Number(expenseForm.amount))) return
    setSavingExpense(true)
    await supabase.from('company_expenses').insert({
      date: expenseForm.date,
      category: expenseForm.category,
      label: expenseForm.label,
      amount: Number(expenseForm.amount),
      paid_by: expenseForm.paid_by || null,
    })
    setExpenseForm({ date: new Date().toISOString().slice(0, 10), category: 'autre', label: '', amount: '', paid_by: '' })
    setShowAddExpense(false)
    setSavingExpense(false)
    await loadBudgetData()
  }

  async function deleteExpense(id: string) {
    if (!confirm('Supprimer cette dépense ?')) return
    setDeletingId(id)
    await supabase.from('company_expenses').delete().eq('id', id)
    setDeletingId(null)
    await loadBudgetData()
  }

  // Calculs
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
  const budgetAmount = budget?.budget ?? 0
  const remaining = budgetAmount - totalExpenses
  const burnRate = budgetAmount > 0 ? Math.round((totalExpenses / budgetAmount) * 100) : 0
  const daysInYear = 365
  const dayOfYear = Math.floor((Date.now() - new Date(`${yearFilter}-01-01`).getTime()) / 86400000) + 1
  const avgDailyExpense = dayOfYear > 0 ? Math.round(totalExpenses / dayOfYear) : 0
  const projectedAnnualExpense = avgDailyExpense * daysInYear

  // Par catégorie
  const byCategory = EXPENSE_CATEGORIES.map(cat => ({
    ...cat,
    total: expenses.filter(e => e.category === cat.value).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  // Par mois
  const byMonth: Record<string, number> = {}
  for (let m = 1; m <= 12; m++) {
    const key = String(m).padStart(2, '0')
    byMonth[key] = expenses
      .filter(e => e.date?.slice(5, 7) === key)
      .reduce((s, e) => s + e.amount, 0)
  }
  const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

  return (
    <div className="space-y-6">

      {/* ── Header budget ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionTitle icon={Package} title="Budget & Dépenses" sub={`Gestion financière interne Habynex ${yearFilter}`} />
        <div className="flex items-center gap-2">
          <select value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none">
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {/* ── Carte budget annuel ── */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Budget annuel {yearFilter}</p>
                {editingBudget ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={budgetInput}
                        onChange={e => setBudgetInput(e.target.value)}
                        placeholder="Ex: 5000000"
                        className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-[#f95d1e] w-48"
                      />
                      <span className="text-sm text-gray-400">FCFA</span>
                    </div>
                    <input
                      type="text"
                      value={budgetNotes}
                      onChange={e => setBudgetNotes(e.target.value)}
                      placeholder="Notes (optionnel)"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-[#f95d1e]"
                    />
                  </div>
                ) : (
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {budgetAmount > 0 ? fmtFcfa(budgetAmount) : <span className="text-gray-300 text-xl">Non défini</span>}
                  </p>
                )}
              </div>
              {isSuperAdmin && (
                <div className="flex gap-2">
                  {editingBudget ? (
                    <>
                      <button onClick={() => { setEditingBudget(false); setBudgetInput(String(budgetAmount)); }}
                        className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        Annuler
                      </button>
                      <button onClick={saveBudget} disabled={savingBudget}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f95d1e] text-white rounded-xl text-xs font-semibold hover:bg-[#e04d0e] transition-colors disabled:opacity-60">
                        {savingBudget ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Sauvegarder
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setEditingBudget(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-600 dark:text-gray-400 hover:border-[#f95d1e] hover:text-[#f95d1e] transition-colors">
                      <Edit3 size={12} /> Modifier
                    </button>
                  )}
                </div>
              )}
            </div>

            {budgetNotes && !editingBudget && (
              <p className="text-xs text-gray-400 mb-4 italic">{budgetNotes}</p>
            )}

            {/* Jauge consommation budget */}
            {budgetAmount > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Consommé : <strong className="text-gray-800 dark:text-white">{fmtFcfa(totalExpenses, true)}</strong></span>
                  <span className={cn('font-semibold', burnRate > 90 ? 'text-red-500' : burnRate > 70 ? 'text-amber-500' : 'text-emerald-500')}>
                    {burnRate}% utilisé
                  </span>
                </div>
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', burnRate > 90 ? 'bg-red-500' : burnRate > 70 ? 'bg-amber-500' : 'bg-emerald-500')}
                    style={{ width: `${Math.min(burnRate, 100)}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className={cn('rounded-xl p-3 text-center', remaining >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20')}>
                    <p className={cn('text-lg font-bold', remaining >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
                      {fmtFcfa(Math.abs(remaining), true)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{remaining >= 0 ? '✅ Restant' : '❌ Dépassement'}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{fmtFcfa(avgDailyExpense, true)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Dépense / jour</p>
                  </div>
                  <div className={cn('rounded-xl p-3 text-center', projectedAnnualExpense > budgetAmount ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-gray-50 dark:bg-gray-800')}>
                    <p className={cn('text-lg font-bold', projectedAnnualExpense > budgetAmount ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-200')}>
                      {fmtFcfa(projectedAnnualExpense, true)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Projection annuelle</p>
                  </div>
                </div>

                {/* Alerte dépassement */}
                {burnRate > 90 && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                      ⚠️ Budget presque épuisé ! Il reste {fmtFcfa(remaining, true)} sur {fmtFcfa(budgetAmount, true)}.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Répartition par catégorie ── */}
          {byCategory.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
              <SectionTitle icon={PieChart} title="Répartition des dépenses par catégorie" />
              <div className="space-y-2.5">
                {byCategory.map(cat => (
                  <div key={cat.value} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', cat.color)}>{cat.label}</span>
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{fmtFcfa(cat.total, true)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-[#f95d1e] rounded-full" style={{ width: `${totalExpenses > 0 ? (cat.total / totalExpenses) * 100 : 0}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 w-10 text-right">
                      {totalExpenses > 0 ? Math.round((cat.total / totalExpenses) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Dépenses par mois ── */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <SectionTitle icon={Calendar} title="Dépenses mensuelles" sub={`Total : ${fmtFcfa(totalExpenses)}`} />
            <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
              {Object.entries(byMonth).map(([m, total], i) => {
                const maxMonth = Math.max(...Object.values(byMonth), 1)
                const pct = (total / maxMonth) * 100
                return (
                  <div key={m} className="flex flex-col items-center gap-1">
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden" style={{ height: 48 }}>
                      <div className={cn('w-full rounded-lg transition-all', total > 0 ? 'bg-[#f95d1e]' : '')}
                        style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }} />
                    </div>
                    <p className="text-[9px] text-gray-400">{MONTH_NAMES[i]}</p>
                    {total > 0 && <p className="text-[8px] font-bold text-gray-600 dark:text-gray-400">{fmt(total, true)}</p>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Liste des dépenses ── */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <SectionTitle icon={CreditCard} title="Détail des dépenses" sub={`${expenses.length} entrée${expenses.length > 1 ? 's' : ''}`} />
              <button onClick={() => setShowAddExpense(!showAddExpense)}
                className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors',
                  showAddExpense
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    : 'bg-[#f95d1e] hover:bg-[#e04d0e] text-white')}>
                {showAddExpense ? <X size={12} /> : <Plus size={12} />}
                {showAddExpense ? 'Annuler' : 'Ajouter une dépense'}
              </button>
            </div>

            {/* Formulaire ajout dépense */}
            {showAddExpense && (
              <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl space-y-3 border border-gray-200 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Nouvelle dépense</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Date</label>
                    <input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none focus:border-[#f95d1e]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Catégorie</label>
                    <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none focus:border-[#f95d1e]">
                      {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 mb-1 block">Description *</label>
                  <input type="text" value={expenseForm.label} onChange={e => setExpenseForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="Ex: Abonnement Vercel, Impression flyers, Déplacement agent…"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none focus:border-[#f95d1e]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Montant (FCFA) *</label>
                    <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="Ex: 15000"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none focus:border-[#f95d1e]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Payé par</label>
                    <input type="text" value={expenseForm.paid_by} onChange={e => setExpenseForm(f => ({ ...f, paid_by: e.target.value }))}
                      placeholder="Ex: Marc, Caisse, CB…"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none focus:border-[#f95d1e]" />
                  </div>
                </div>
                <button onClick={addExpense} disabled={savingExpense || !expenseForm.label || !expenseForm.amount}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#f95d1e] hover:bg-[#e04d0e] text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60">
                  {savingExpense ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Enregistrer la dépense
                </button>
              </div>
            )}

            {/* Liste */}
            {expenses.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <p className="text-2xl mb-2">💸</p>
                <p className="text-sm">Aucune dépense enregistrée pour {yearFilter}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {expenses.map(exp => (
                  <div key={exp.id} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors group">
                    <div className="w-9 h-9 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center text-base flex-shrink-0">
                      {EXPENSE_CATEGORIES.find(c => c.value === exp.category)?.label.slice(0, 2) ?? '📌'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{exp.label}</p>
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0', getCategoryStyle(exp.category))}>
                          {getCategoryLabel(exp.category).split(' ').slice(1).join(' ')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(exp.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {exp.paid_by && ` · Par ${exp.paid_by}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="text-sm font-bold text-red-500 dark:text-red-400">−{fmtFcfa(exp.amount, true)}</p>
                      {isSuperAdmin && (
                        <button onClick={() => deleteExpense(exp.id!)} disabled={deletingId === exp.id}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors opacity-0 group-hover:opacity-100">
                          {deletingId === exp.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl mt-2 border-t border-gray-100 dark:border-gray-700">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Total dépenses {yearFilter}</span>
                  <span className="text-base font-bold text-red-500">−{fmtFcfa(totalExpenses)}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────

export function FinancePage() {
  const supabase = createClient()
  const [data, setData] = useState<FinanceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState<'revenus' | 'budget'>('revenus')

  const load = useCallback(async () => {
    const now = new Date()
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

    const [
      { data: { user } },
      { data: allBookings },
      { data: allCommissions },
      { data: agents },
      { data: topAgentsRaw },
      { data: recentBookingsRaw },
      { data: recentCommissionsRaw },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('visit_bookings').select('id, amount_paid, is_free, status, created_at, paid_at').eq('status', 'paid').order('created_at', { ascending: false }),
      supabase.from('commissions').select('id, total_commission, agent_amount, taxi_allowance, habynex_amount, status, created_at, agent_paid_at').order('created_at', { ascending: false }),
      supabase.from('agents').select('id, missions_completed, success_rate').eq('status', 'active'),
      supabase.from('agents').select(`id, missions_completed, success_rate, profile:profiles!agents_id_fkey(full_name), commissions(total_commission, status)`).eq('status', 'active').order('missions_completed', { ascending: false }).limit(5),
      supabase.from('visit_bookings').select('id, amount_paid, is_free, status, created_at, client:profiles!visit_bookings_client_id_fkey(full_name)').order('created_at', { ascending: false }).limit(6),
      supabase.from('commissions').select('id, total_commission, habynex_amount, status, created_at, listing:listings!commissions_listing_id_fkey(title)').order('created_at', { ascending: false }).limit(4),
    ])

    // Vérifier super admin
    if (user) {
      const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'super_admin').single()
      setIsSuperAdmin(!!roleData)
    }

    const bookings = allBookings ?? []
    const commissions = allCommissions ?? []
    const paidBookings = bookings.filter(b => !b.is_free)
    const freeBookings = bookings.filter(b => b.is_free)
    const visitTotal = paidBookings.reduce((s, b) => s + (b.amount_paid ?? 0), 0)
    const visitThisMonth = paidBookings.filter(b => b.created_at >= startThisMonth).reduce((s, b) => s + (b.amount_paid ?? 0), 0)
    const visitLastMonth = paidBookings.filter(b => b.created_at >= startLastMonth && b.created_at <= endLastMonth).reduce((s, b) => s + (b.amount_paid ?? 0), 0)
    const collected = commissions.filter(c => c.status === 'collected' || c.status === 'paid_agent')
    const due = commissions.filter(c => c.status === 'due')
    const commTotal = collected.reduce((s, c) => s + (c.habynex_amount ?? 0), 0)
    const commThisMonth = collected.filter(c => c.created_at >= startThisMonth).reduce((s, c) => s + (c.habynex_amount ?? 0), 0)
    const commLastMonth = collected.filter(c => c.created_at >= startLastMonth && c.created_at <= endLastMonth).reduce((s, c) => s + (c.habynex_amount ?? 0), 0)
    const habynexNet = collected.reduce((s, c) => s + (c.habynex_amount ?? 0), 0)
    const agentsPaid = collected.reduce((s, c) => s + (c.agent_amount ?? 0) + (c.taxi_allowance ?? 0), 0)
    const duePending = due.reduce((s, c) => s + (c.total_commission ?? 0), 0)
    const totalRevenue = visitTotal + commTotal
    const totalThisMonth = visitThisMonth + commThisMonth
    const totalLastMonth = visitLastMonth + commLastMonth
    const activeAgents = agents?.length ?? 0
    const totalVisitsCompleted = agents?.reduce((s, a) => s + (a.missions_completed ?? 0), 0) ?? 0
    const avgSuccessRate = agents?.length ? Math.round(agents.reduce((s, a) => s + (a.success_rate ?? 0), 0) / agents.length) : 0
    const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
    const monthlyMap: Record<string, { visits: number; commissions: number }> = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = { visits: 0, commissions: 0 }
    }
    paidBookings.forEach(b => { const k = b.created_at?.slice(0, 7); if (k && monthlyMap[k]) monthlyMap[k].visits += b.amount_paid ?? 0 })
    collected.forEach(c => { const k = c.created_at?.slice(0, 7); if (k && monthlyMap[k]) monthlyMap[k].commissions += c.habynex_amount ?? 0 })
    const monthlyRevenue = Object.entries(monthlyMap).map(([key, v]) => {
      const [, month] = key.split('-').map(Number)
      return { month: key, label: MONTH_NAMES[month - 1], visits: v.visits, commissions: v.commissions, total: v.visits + v.commissions }
    })
    const topAgents: TopAgent[] = (topAgentsRaw ?? []).map((a: any) => {
      const profile = Array.isArray(a.profile) ? a.profile[0] : a.profile
      const comms = (a.commissions ?? []) as any[]
      return {
        id: a.id, name: profile?.full_name ?? 'Agent',
        missionsCompleted: a.missions_completed ?? 0,
        totalCommission: comms.filter(c => c.status === 'collected' || c.status === 'paid_agent').reduce((s: number, c: any) => s + (c.total_commission ?? 0), 0),
        successRate: Math.round((a.success_rate ?? 0) * 100),
      }
    }).sort((a: TopAgent, b: TopAgent) => b.totalCommission - a.totalCommission)
    const recentTransactions: Transaction[] = [
      ...(recentBookingsRaw ?? []).map((b: any) => {
        const client = Array.isArray(b.client) ? b.client[0] : b.client
        return { id: b.id, type: 'visit' as const, label: `Visite — ${client?.full_name ?? 'Client'}`, amount: b.amount_paid ?? 0, status: b.is_free ? 'gratuite' : 'payée', date: b.created_at }
      }),
      ...(recentCommissionsRaw ?? []).map((c: any) => {
        const listing = Array.isArray(c.listing) ? c.listing[0] : c.listing
        return { id: c.id, type: 'commission' as const, label: `Commission — ${listing?.title?.slice(0, 30) ?? 'Bien'}`, amount: c.habynex_amount ?? 0, status: c.status, date: c.created_at }
      }),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8)

    setData({ visitRevenue: { total: visitTotal, thisMonth: visitThisMonth, lastMonth: visitLastMonth, count: paidBookings.length }, commissions: { totalCollected: commTotal, thisMonth: commThisMonth, lastMonth: commLastMonth, totalDue: due.length, duePending, agentsPaid, habynexNet }, totalRevenue, totalRevenueThisMonth: totalThisMonth, totalRevenueLastMonth: totalLastMonth, agentsActive: activeAgents, avgRevenuePerAgent: activeAgents ? Math.round(commTotal / activeAgents) : 0, visitsCompleted: totalVisitsCompleted, visitsTotal: bookings.length, visitSuccessRate: avgSuccessRate, freeVisits: freeBookings.length, paidVisits: paidBookings.length, monthlyRevenue, topAgents, recentTransactions })
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingSpinner />
  if (!data) return null

  const totalGrowth = growthPct(data.totalRevenueThisMonth, data.totalRevenueLastMonth)
  const visitGrowth = growthPct(data.visitRevenue.thisMonth, data.visitRevenue.lastMonth)
  const commGrowth = growthPct(data.commissions.thisMonth, data.commissions.lastMonth)
  const last3 = data.monthlyRevenue.slice(-3).map(m => m.total)
  const avg3 = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0
  const projection = Math.round(avg3 * 12)

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Finance & Revenus" subtitle="Tableau de bord financier complet — données temps réel" />
        <button onClick={() => { setRefreshing(true); load() }} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-gray-400 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Actualiser
        </button>
      </div>

      {/* ── Onglets ── */}
      <div className="flex gap-2 border-b border-gray-100 dark:border-gray-800">
        {[
          { key: 'revenus', label: '📊 Revenus & KPIs' },
          { key: 'budget', label: '💸 Budget & Dépenses' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={cn('px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors',
              activeTab === tab.key
                ? 'border-[#f95d1e] text-[#f95d1e]'
                : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300')}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Onglet Revenus ── */}
      {activeTab === 'revenus' && (
        <div className="space-y-8">
          {/* KPIs */}
          <div>
            <SectionTitle icon={BarChart3} title="Vue d'ensemble" sub={`Mis à jour le ${formatDate(new Date().toISOString(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`} />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard title="Revenus totaux (all-time)" value={fmtFcfa(data.totalRevenue, true)} sub={`+${fmtFcfa(data.totalRevenueThisMonth, true)} ce mois`} icon={DollarSign} color="bg-[#f95d1e]" growth={totalGrowth} />
              <KpiCard title="Revenus visites terrain" value={fmtFcfa(data.visitRevenue.total, true)} sub={`${data.visitRevenue.count} visites payées`} icon={CreditCard} color="bg-blue-500" growth={visitGrowth} />
              <KpiCard title="Net Habynex (commissions)" value={fmtFcfa(data.commissions.habynexNet, true)} sub={`${data.commissions.totalDue} à collecter`} icon={Wallet} color="bg-emerald-500" growth={commGrowth} />
              <KpiCard title="Projection annuelle" value={fmtFcfa(projection, true)} sub="Basée sur les 3 derniers mois" icon={Target} color="bg-purple-500" />
            </div>
          </div>

          {/* Graphique */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <SectionTitle icon={TrendingUp} title="Évolution des revenus" sub="12 derniers mois" />
            <RevenueBarChart data={data.monthlyRevenue} />
          </div>

          {/* Répartition + Commissions */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
              <SectionTitle icon={PieChart} title="Répartition des revenus" />
              <DonutChart slices={[
                { label: 'Visites terrain', value: data.visitRevenue.total, color: '#f95d1e' },
                { label: 'Net Habynex (commissions)', value: data.commissions.habynexNet, color: '#10b981' },
              ]} />
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="bg-orange-50 dark:bg-orange-950/20 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-[#f95d1e]">{data.paidVisits}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Visites payées</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/20 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{data.freeVisits}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Visites gratuites</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
              <SectionTitle icon={Building2} title="Détail commissions" sub="Flux financiers agents / Habynex" />
              <div className="space-y-3">
                {[
                  { label: 'Commissions collectées (brut)', value: data.commissions.totalCollected + data.commissions.agentsPaid, bg: 'bg-gray-50 dark:bg-gray-800', color: 'text-gray-800 dark:text-white', icon: '📥' },
                  { label: 'Reversé aux agents', value: data.commissions.agentsPaid, bg: 'bg-blue-50 dark:bg-blue-950/20', color: 'text-blue-600 dark:text-blue-400', icon: '👤' },
                  { label: 'Net Habynex', value: data.commissions.habynexNet, bg: 'bg-emerald-50 dark:bg-emerald-950/20', color: 'text-emerald-600 dark:text-emerald-400', icon: '🏢' },
                  { label: 'En attente de collecte', value: data.commissions.duePending, bg: 'bg-amber-50 dark:bg-amber-950/20', color: 'text-amber-600 dark:text-amber-400', icon: '⏳' },
                ].map(row => (
                  <div key={row.label} className={cn('flex items-center justify-between px-4 py-3 rounded-xl', row.bg)}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{row.icon}</span>
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{row.label}</span>
                    </div>
                    <span className={cn('text-sm font-bold', row.color)}>{fmtFcfa(row.value, true)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top agents */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <SectionTitle icon={Users} title="Performance agents" sub={`${data.agentsActive} agents actifs · ${data.visitsCompleted} missions`} />
            <div className="grid grid-cols-3 gap-4 mb-5">
              {[
                { label: 'Agents actifs', value: data.agentsActive, color: 'text-blue-600 dark:text-blue-400' },
                { label: 'Revenu moyen / agent', value: fmtFcfa(data.avgRevenuePerAgent, true), color: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Taux de succès moyen', value: `${data.visitSuccessRate}%`, color: 'text-[#f95d1e]' },
              ].map(s => (
                <div key={s.label} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {data.topAgents.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      {['Agent', 'Missions', 'Taux succès', 'Commission générée'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {data.topAgents.map((agent, i) => (
                      <tr key={agent.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className={cn('w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0', i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-700' : 'bg-gray-200 dark:bg-gray-700')}>
                              {i < 3 ? ['🥇','🥈','🥉'][i] : <span className="text-gray-600 dark:text-gray-300">{i + 1}</span>}
                            </div>
                            <span className="font-medium text-gray-800 dark:text-white text-xs">{agent.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-gray-600 dark:text-gray-300 font-semibold">{agent.missionsCompleted}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 max-w-[60px]">
                              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${agent.successRate}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{agent.successRate}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs font-bold text-emerald-600 dark:text-emerald-400">{fmtFcfa(agent.totalCommission, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Transactions récentes */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <SectionTitle icon={CreditCard} title="Dernières transactions" sub="Visites et commissions" />
            <div className="space-y-2">
              {data.recentTransactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0', tx.type === 'visit' ? 'bg-orange-100 dark:bg-orange-950/30' : 'bg-emerald-100 dark:bg-emerald-950/30')}>
                    {tx.type === 'visit' ? '🏠' : '💰'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{tx.label}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(tx.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      <span className={cn('font-medium capitalize', tx.status === 'payée' || tx.status === 'collected' || tx.status === 'paid_agent' ? 'text-emerald-500' : 'text-amber-500')}>{tx.status}</span>
                    </p>
                  </div>
                  {tx.amount > 0
                    ? <p className={cn('text-sm font-bold flex-shrink-0', tx.type === 'visit' ? 'text-[#f95d1e]' : 'text-emerald-600 dark:text-emerald-400')}>+{fmtFcfa(tx.amount, true)}</p>
                    : <p className="text-xs text-gray-400 flex-shrink-0">Gratuite</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Métriques investisseurs */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-2 mb-5">
              <Target size={16} className="text-[#f95d1e]" />
              <h2 className="text-sm font-bold">Métriques clés — Vue investisseur</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'Revenu total généré', value: fmtFcfa(data.totalRevenue + data.commissions.agentsPaid, true), note: 'Brut toutes sources' },
                { label: 'Revenu net plateforme', value: fmtFcfa(data.commissions.habynexNet + data.visitRevenue.total, true), note: 'Ce que Habynex conserve' },
                { label: 'Projection annuelle', value: fmtFcfa(projection, true), note: 'Basée sur tendance actuelle' },
                { label: 'Valeur cumulée agents', value: fmtFcfa(data.commissions.agentsPaid, true), note: `Reversé à ${data.agentsActive} agents` },
                { label: 'Croissance mensuelle', value: `${totalGrowth >= 0 ? '+' : ''}${totalGrowth}%`, note: 'vs mois précédent' },
                { label: 'Taux de conversion visites', value: `${data.visitSuccessRate}%`, note: 'Visites → succès terrain' },
              ].map(m => (
                <div key={m.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-xl font-bold text-white mb-0.5">{m.value}</p>
                  <p className="text-xs font-medium text-gray-300">{m.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{m.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Onglet Budget ── */}
      {activeTab === 'budget' && (
        <BudgetSection isSuperAdmin={isSuperAdmin} />
      )}
    </div>
  )
}
