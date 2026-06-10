'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  FileText, Plus, Pencil, Trash2, Eye, Save, Loader2,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, Download, AlertTriangle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, LoadingSpinner } from '@/components/ui/index'
import { formatDate, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContractTemplate {
  id: string
  title: string
  type: 'agent' | 'photographer'
  version: string
  content: ContractContent
  is_active: boolean
  created_at: string
  updated_at: string
}

interface ContractContent {
  articles: ContractArticle[]
  remuneration: RemunerationConfig
  footer_note?: string
}

interface ContractArticle {
  id: string
  title: string
  body: string
}

interface RemunerationConfig {
  fixed_salary: number          // Salaire fixe mensuel (FCFA)
  min_missions: number          // Missions min pour déclencher le fixe
  daily_allowance: number       // Indemnité journalière (FCFA)
  payment_day: string           // Ex: "1er de chaque mois"
  allowance_payment: string     // Ex: "chaque vendredi"
  notes: string                 // Avertissements/notes
}

interface SignedContract {
  id: string
  agent_id: string
  template_id: string | null
  signature_data: string | null
  fingerprint: string | null
  signed_at: string
  status: 'signed' | 'revoked' | 'expired'
  created_at: string
  profile?: { full_name: string | null; phone: string | null }
  template?: { title: string; version: string }
}

// ─── Contenu par défaut (basé sur le contrat actuel Habynex) ──────────────────
const DEFAULT_ARTICLES: ContractArticle[] = [
  {
    id: 'parties',
    title: 'ARTICLE 1 — ENTRE LES PARTIES',
    body: 'Habynex, plateforme immobilière numérique, dont le siège social est à Yaoundé, Cameroun (ci-après « Habynex » ou « la Plateforme »), ET l\'Agent/Photographe (ci-après « le Prestataire »), dont les coordonnées sont enregistrées dans le système Habynex.',
  },
  {
    id: 'objet',
    title: 'ARTICLE 2 — OBJET DU CONTRAT',
    body: 'Le présent contrat a pour objet de définir les conditions dans lesquelles le Prestataire intervient en qualité de prestataire indépendant pour le compte d\'Habynex afin d\'accompagner les clients lors des visites de biens immobiliers référencés sur la plateforme.',
  },
  {
    id: 'missions',
    title: 'ARTICLE 3 — MISSIONS DU PRESTATAIRE',
    body: '• Contacter les clients dans les 2 heures suivant l\'attribution d\'une mission.\n• Accompagner le client sur le terrain pour visiter les biens sélectionnés.\n• Fournir des informations honnêtes et précises sur les biens visités.\n• Renseigner le rapport de visite sur la plateforme dans les 24h suivant la visite.\n• Maintenir un comportement professionnel, ponctuel et respectueux en toutes circonstances.',
  },
  {
    id: 'obligations',
    title: 'ARTICLE 4 — OBLIGATIONS DU PRESTATAIRE',
    body: '• Ne jamais recevoir de paiements en dehors de la plateforme Habynex.\n• Ne jamais promettre un bien à un client contre une rémunération personnelle.\n• Signaler immédiatement tout propriétaire ou bien suspect à l\'équipe Habynex.\n• Maintenir son téléphone actif et disponible pendant les heures de travail.\n• Ne pas partager les informations confidentielles des clients avec des tiers.\n• Respecter les politiques de traitement des données personnelles d\'Habynex.',
  },
  {
    id: 'resiliation',
    title: 'ARTICLE 5 — RÉSILIATION',
    body: 'Le présent contrat peut être résilié :\n• Par Habynex : immédiatement et sans préavis en cas de faute grave (fraude, perception illicite de fonds, comportement irrespectueux envers un client).\n• Par le Prestataire : avec un préavis de 7 jours notifié via la plateforme ou par WhatsApp au +237 654 888 084.',
  },
  {
    id: 'droit',
    title: 'ARTICLE 6 — DROIT APPLICABLE',
    body: 'Le présent contrat est soumis au droit camerounais. En cas de litige, les parties conviennent de rechercher une solution amiable. À défaut, les tribunaux compétents de Yaoundé seront saisis.',
  },
]

const DEFAULT_REMUNERATION: RemunerationConfig = {
  fixed_salary: 50000,
  min_missions: 4,
  daily_allowance: 1000,
  payment_day: '1er de chaque mois',
  allowance_payment: 'chaque vendredi pour les jours de la semaine écoulée',
  notes: 'Toutes les rémunérations sont versées exclusivement via la plateforme Habynex. Le Prestataire ne peut en aucun cas percevoir des fonds directement auprès des clients pour des prestations officielles Habynex.',
}

// ─── Composant principal ───────────────────────────────────────────────────────
export function ContratsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'templates' | 'signed'>('templates')
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [signed, setSigned] = useState<SignedContract[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [expandedSignedId, setExpandedSignedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: tpls }, { data: sigs }] = await Promise.all([
      supabase.from('contract_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('agent_contracts').select(`
        id, agent_id, template_id, signature_data, fingerprint, signed_at, status, created_at,
        profile:profiles!agent_contracts_agent_id_fkey(full_name, phone)
      `).order('signed_at', { ascending: false }).limit(100),
    ])
    setTemplates(tpls ?? [])
    setSigned(sigs ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function newTemplate() {
    setEditingTemplate({
      id: '',
      title: 'Contrat Agent Habynex',
      type: 'agent',
      version: '1.0',
      content: { articles: DEFAULT_ARTICLES, remuneration: DEFAULT_REMUNERATION },
      is_active: true,
      created_at: '',
      updated_at: '',
    })
    setShowEditor(true)
  }

  async function saveTemplate(tpl: ContractTemplate) {
    setSaving(true)
    try {
      if (tpl.id) {
        const { error } = await supabase.from('contract_templates')
          .update({ title: tpl.title, type: tpl.type, version: tpl.version, content: tpl.content, is_active: tpl.is_active, updated_at: new Date().toISOString() })
          .eq('id', tpl.id)
        if (error) throw error
        toast.success('Contrat mis à jour ✅')
      } else {
        const { error } = await supabase.from('contract_templates')
          .insert({ title: tpl.title, type: tpl.type, version: tpl.version, content: tpl.content, is_active: tpl.is_active })
        if (error) throw error
        toast.success('Contrat créé ✅')
      }
      setShowEditor(false)
      setEditingTemplate(null)
      await load()
    } catch (e: any) {
      toast.error('Erreur : ' + (e?.message ?? 'inconnue'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteTemplate(id: string) {
    const { error } = await supabase.from('contract_templates').delete().eq('id', id)
    if (error) { toast.error('Erreur suppression'); return }
    toast.success('Contrat supprimé')
    setDeleteConfirm(null)
    await load()
  }

  async function toggleActive(tpl: ContractTemplate) {
    await supabase.from('contract_templates').update({ is_active: !tpl.is_active }).eq('id', tpl.id)
    await load()
  }

  async function revokeContract(id: string) {
    await supabase.from('agent_contracts').update({ status: 'revoked' }).eq('id', id)
    toast('Contrat révoqué', { icon: '⚠️' })
    await load()
  }

  if (showEditor && editingTemplate) {
    return (
      <ContractEditor
        template={editingTemplate}
        saving={saving}
        onSave={saveTemplate}
        onCancel={() => { setShowEditor(false); setEditingTemplate(null) }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contrats de travail"
        subtitle="Gérez les modèles de contrats et les signatures des agents/photographes"
        action={
          <button onClick={newTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus size={14} /> Nouveau contrat
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 w-fit">
        {[{ key: 'templates', label: `📄 Modèles (${templates.length})` }, { key: 'signed', label: `✍️ Signés (${signed.length})` }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-all',
              tab === t.key ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {/* ── ONGLET MODÈLES ── */}
          {tab === 'templates' && (
            <div className="space-y-3">
              {templates.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <FileText size={36} className="text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">Aucun modèle de contrat</p>
                  <button onClick={newTemplate}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#f95d1e] text-white rounded-xl text-sm font-semibold hover:opacity-90">
                    <Plus size={14} /> Créer le premier contrat
                  </button>
                </div>
              ) : templates.map(tpl => (
                <div key={tpl.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <div className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-sm text-gray-800 dark:text-white">{tpl.title}</p>
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                          tpl.type === 'agent' ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/30' : 'bg-purple-100 text-purple-600 dark:bg-purple-950/30')}>
                          {tpl.type === 'agent' ? '👤 Agent' : '📷 Photographe'}
                        </span>
                        <span className="text-xs text-gray-400">v{tpl.version}</span>
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                          tpl.is_active ? 'bg-green-100 text-green-600 dark:bg-green-950/30' : 'bg-gray-100 text-gray-400 dark:bg-gray-800')}>
                          {tpl.is_active ? '✓ Actif' : '○ Inactif'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {tpl.content.articles.length} articles · Fixe: {tpl.content.remuneration.fixed_salary.toLocaleString()} FCFA/mois · Indemnité: {tpl.content.remuneration.daily_allowance.toLocaleString()} FCFA/jour
                        · Modifié le {formatDate(tpl.updated_at || tpl.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => toggleActive(tpl)}
                        className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
                          tpl.is_active
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                            : 'bg-green-100 dark:bg-green-950/30 text-green-600 hover:bg-green-200')}>
                        {tpl.is_active ? 'Désactiver' : 'Activer'}
                      </button>
                      <button onClick={() => { setEditingTemplate(tpl); setShowEditor(true) }}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <Pencil size={14} />
                      </button>
                      {deleteConfirm === tpl.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => deleteTemplate(tpl.id)}
                            className="px-2 py-1 bg-red-500 text-white rounded-lg text-xs font-semibold">Confirmer</button>
                          <button onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-lg text-xs">Annuler</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(tpl.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── ONGLET SIGNÉS ── */}
          {tab === 'signed' && (
            <div className="space-y-3">
              {signed.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <p className="text-4xl mb-3">✍️</p>
                  <p className="text-gray-500">Aucun contrat signé pour l'instant</p>
                </div>
              ) : signed.map(s => {
                const profile = Array.isArray(s.profile) ? s.profile[0] : s.profile
                const isExp = expandedSignedId === s.id
                return (
                  <div key={s.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <div className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-sm text-gray-800 dark:text-white">{profile?.full_name ?? 'Agent inconnu'}</p>
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                            s.status === 'signed' ? 'bg-green-100 text-green-600 dark:bg-green-950/30' :
                            s.status === 'revoked' ? 'bg-red-100 text-red-600 dark:bg-red-950/30' :
                            'bg-gray-100 text-gray-400')}>
                            {s.status === 'signed' ? '✓ Signé' : s.status === 'revoked' ? '✗ Révoqué' : 'Expiré'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {profile?.phone ?? '—'} · Signé le {formatDate(s.signed_at, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-xs font-mono text-gray-300 dark:text-gray-600 mt-0.5">
                          Réf: {s.id.slice(0, 16).toUpperCase()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {s.status === 'signed' && (
                          <button onClick={() => revokeContract(s.id)}
                            className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-500 text-xs font-semibold hover:bg-red-100 transition-colors">
                            Révoquer
                          </button>
                        )}
                        <button onClick={() => setExpandedSignedId(isExp ? null : s.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                          {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>
                    {isExp && (
                      <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3 animate-fade-in">
                        {s.signature_data && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Signature électronique</p>
                            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-2 inline-block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={s.signature_data} alt="Signature" className="h-16 object-contain" />
                            </div>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Empreinte numérique</p>
                          <p className="text-xs font-mono text-gray-400 break-all">{s.fingerprint ?? '—'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Éditeur de contrat ────────────────────────────────────────────────────────
function ContractEditor({
  template,
  saving,
  onSave,
  onCancel,
}: {
  template: ContractTemplate
  saving: boolean
  onSave: (tpl: ContractTemplate) => void
  onCancel: () => void
}) {
  const [tpl, setTpl] = useState<ContractTemplate>(JSON.parse(JSON.stringify(template)))
  const [activeSection, setActiveSection] = useState<'meta' | 'remuneration' | 'articles'>('meta')

  function updateRemu(field: keyof RemunerationConfig, value: string | number) {
    setTpl(prev => ({ ...prev, content: { ...prev.content, remuneration: { ...prev.content.remuneration, [field]: value } } }))
  }

  function updateArticle(idx: number, field: 'title' | 'body', value: string) {
    const arts = [...tpl.content.articles]
    arts[idx] = { ...arts[idx], [field]: value }
    setTpl(prev => ({ ...prev, content: { ...prev.content, articles: arts } }))
  }

  function addArticle() {
    const arts = [...tpl.content.articles, { id: `art_${Date.now()}`, title: 'NOUVEL ARTICLE', body: '' }]
    setTpl(prev => ({ ...prev, content: { ...prev.content, articles: arts } }))
  }

  function removeArticle(idx: number) {
    const arts = tpl.content.articles.filter((_, i) => i !== idx)
    setTpl(prev => ({ ...prev, content: { ...prev.content, articles: arts } }))
  }

  const inputCls = "w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 outline-none focus:border-[#f95d1e] transition-colors"

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {tpl.id ? 'Modifier le contrat' : 'Nouveau contrat'}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Définissez le contenu et les conditions de rémunération</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Annuler
          </button>
          <button onClick={() => onSave(tpl)} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Sauvegarder
          </button>
        </div>
      </div>

      {/* Sections nav */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 w-fit">
        {[
          { key: 'meta', label: '⚙️ Infos générales' },
          { key: 'remuneration', label: '💰 Rémunération' },
          { key: 'articles', label: '📋 Articles' },
        ].map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key as any)}
            className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-all',
              activeSection === s.key ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">

        {/* ── Section méta ── */}
        {activeSection === 'meta' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Titre du contrat</label>
                <input type="text" value={tpl.title} onChange={e => setTpl(p => ({ ...p, title: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Version</label>
                <input type="text" value={tpl.version} onChange={e => setTpl(p => ({ ...p, version: e.target.value }))} className={inputCls} placeholder="Ex: 1.0, 2.1" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Type de prestataire</label>
              <select value={tpl.type} onChange={e => setTpl(p => ({ ...p, type: e.target.value as 'agent' | 'photographer' }))} className={inputCls}>
                <option value="agent">Agent terrain</option>
                <option value="photographer">Photographe</option>
              </select>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-gray-100 dark:border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Contrat actif</p>
                <p className="text-xs text-gray-400">Ce modèle sera présenté aux nouveaux prestataires</p>
              </div>
              <button type="button" onClick={() => setTpl(p => ({ ...p, is_active: !p.is_active }))}
                className={cn('relative w-10 h-5 rounded-full transition-colors', tpl.is_active ? 'bg-[#f95d1e]' : 'bg-gray-200 dark:bg-gray-700')}>
                <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', tpl.is_active ? 'translate-x-5 left-0.5' : 'translate-x-0.5 left-0')} />
              </button>
            </div>
          </div>
        )}

        {/* ── Section rémunération ── */}
        {activeSection === 'remuneration' && (
          <div className="space-y-5">
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Ces valeurs sont affichées dans le contrat que signent les agents/photographes. Toute modification crée une nouvelle version du contrat.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Salaire fixe mensuel (FCFA)</label>
                <input type="number" value={tpl.content.remuneration.fixed_salary}
                  onChange={e => updateRemu('fixed_salary', Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Missions min. pour le fixe</label>
                <input type="number" value={tpl.content.remuneration.min_missions}
                  onChange={e => updateRemu('min_missions', Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Indemnité journalière (FCFA)</label>
                <input type="number" value={tpl.content.remuneration.daily_allowance}
                  onChange={e => updateRemu('daily_allowance', Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Jour de versement du fixe</label>
                <input type="text" value={tpl.content.remuneration.payment_day}
                  onChange={e => updateRemu('payment_day', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Versement indemnités journalières</label>
              <input type="text" value={tpl.content.remuneration.allowance_payment}
                onChange={e => updateRemu('allowance_payment', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Note / avertissement (affiché en rouge dans le contrat)</label>
              <textarea value={tpl.content.remuneration.notes}
                onChange={e => updateRemu('notes', e.target.value)}
                rows={3} className={cn(inputCls, 'resize-none')} />
            </div>

            {/* Aperçu */}
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Aperçu dans le contrat</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                L'Agent perçoit une rémunération composée de deux éléments :
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <li>
                  <strong>Salaire fixe :</strong> {tpl.content.remuneration.fixed_salary.toLocaleString()} FCFA par mois,
                  versé le {tpl.content.remuneration.payment_day} via la plateforme Habynex, sous réserve d'avoir
                  effectué au minimum {tpl.content.remuneration.min_missions} missions dans le mois.
                </li>
                <li>
                  <strong>Indemnité de déplacement :</strong> {tpl.content.remuneration.daily_allowance.toLocaleString()} FCFA
                  par jour de mission active. Cette indemnité est versée {tpl.content.remuneration.allowance_payment}.
                </li>
              </ul>
              {tpl.content.remuneration.notes && (
                <p className="mt-3 text-xs text-red-600 dark:text-red-400 font-medium">
                  ⚠️ {tpl.content.remuneration.notes}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Section articles ── */}
        {activeSection === 'articles' && (
          <div className="space-y-4">
            {tpl.content.articles.map((art, idx) => (
              <div key={art.id} className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800">
                  <span className="text-xs font-bold text-gray-400 w-5">{idx + 1}</span>
                  <input type="text" value={art.title}
                    onChange={e => updateArticle(idx, 'title', e.target.value)}
                    className="flex-1 bg-transparent text-sm font-semibold text-gray-700 dark:text-gray-300 outline-none" />
                  <button onClick={() => removeArticle(idx)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
                <textarea value={art.body}
                  onChange={e => updateArticle(idx, 'body', e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 outline-none resize-y" />
              </div>
            ))}
            <button onClick={addArticle}
              className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 rounded-2xl text-sm font-medium hover:border-[#f95d1e] hover:text-[#f95d1e] transition-colors flex items-center justify-center gap-2">
              <Plus size={16} /> Ajouter un article
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
