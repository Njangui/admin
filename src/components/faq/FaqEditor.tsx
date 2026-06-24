'use client'
// ================================================================
// FaqEditor.tsx — Panel admin pour voir et modifier le FAQ d'une annonce
// À placer dans : src/components/faq/FaqEditor.tsx (admin)
//
// Intégration dans AnnoncesPage :
//   <FaqEditor listingId={selectedListing.id} listingTitle={selectedListing.title} />
// ================================================================

import { useState, useEffect } from 'react'
import { Sparkles, Plus, Trash2, Save, RefreshCw, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

export interface FaqItem {
  q: string
  a: string
  keywords: string[]
}

interface FaqEditorProps {
  listingId: string
  listingTitle: string
  onClose?: () => void
}

export function FaqEditor({ listingId, listingTitle, onClose }: FaqEditorProps) {
  const supabase = createClient()
  const [faqId, setFaqId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<FaqItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [generatedBy, setGeneratedBy] = useState<'ai' | 'admin'>('ai')
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  useEffect(() => { loadFaq() }, [listingId])

  async function loadFaq() {
    setLoading(true)
    const { data } = await supabase
      .from('listing_faqs')
      .select('id, questions, generated_by, generated_at')
      .eq('listing_id', listingId)
      .single()

    if (data) {
      setFaqId(data.id)
      setQuestions(data.questions as FaqItem[])
      setGeneratedBy(data.generated_by as 'ai' | 'admin')
      setGeneratedAt(data.generated_at)
    } else {
      setQuestions([])
      setFaqId(null)
    }
    setLoading(false)
  }

  async function saveFaq() {
    setSaving(true)
    try {
      if (faqId) {
        // Mise à jour
        const { error } = await supabase
          .from('listing_faqs')
          .update({ questions, generated_by: 'admin' })
          .eq('id', faqId)
        if (error) throw error
      } else {
        // Création manuelle
        const { data, error } = await supabase
          .from('listing_faqs')
          .insert({ listing_id: listingId, questions, generated_by: 'admin' })
          .select('id').single()
        if (error) throw error
        setFaqId(data.id)
      }
      setGeneratedBy('admin')
      toast.success('FAQ sauvegardé ✅')
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function regenerateFaq() {
    if (!confirm('Régénérer le FAQ avec l\'IA ? Les modifications manuelles seront perdues.')) return
    setGenerating(true)
    try {
      // Supprimer le FAQ existant pour permettre la regénération
      if (faqId) {
        await supabase.from('listing_faqs').delete().eq('id', faqId)
        setFaqId(null)
      }

      // ⚠️ Cette route est sur habynex (pas sur admin)
      // Utiliser www.habynex.com pour éviter la redirection 308 de Vercel
      const habynexUrl = process.env.NEXT_PUBLIC_HABYNEX_URL ?? 'https://www.habynex.com'
      const res = await fetch(`${habynexUrl}/api/ai/generate-faq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur génération')
      toast.success(`FAQ régénéré — ${data.count} questions ✨`)
      await loadFaq()
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur génération')
    } finally {
      setGenerating(false)
    }
  }

  function addQuestion() {
    const newItem: FaqItem = { q: '', a: '', keywords: [] }
    setQuestions(prev => [...prev, newItem])
    setExpandedIdx(questions.length)
  }

  function removeQuestion(idx: number) {
    setQuestions(prev => prev.filter((_, i) => i !== idx))
    setExpandedIdx(null)
  }

  function updateQuestion(idx: number, field: keyof FaqItem, value: string | string[]) {
    setQuestions(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function updateKeywords(idx: number, raw: string) {
    const kws = raw.split(',').map(k => k.trim()).filter(Boolean)
    updateQuestion(idx, 'keywords', kws)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles size={16} className="text-[#f95d1e]" />
            FAQ de l&apos;annonce
          </h3>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{listingTitle}</p>
          {generatedAt && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              {generatedBy === 'ai' ? '🤖 Généré par l\'IA' : '✏️ Modifié par un admin'} —{' '}
              {new Date(generatedAt).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onClose && (
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Barre d'actions */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={regenerateFaq} disabled={generating}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-400 hover:border-[#f95d1e] hover:text-[#f95d1e] transition-colors disabled:opacity-50">
          {generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {generating ? 'Génération…' : 'Régénérer avec l\'IA'}
        </button>
        <button onClick={addQuestion}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-400 hover:border-green-500 hover:text-green-600 transition-colors">
          <Plus size={12} /> Ajouter une question
        </button>
        <button onClick={saveFaq} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#f95d1e] hover:bg-[#e04d0e] text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-60 ml-auto">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>

      {/* Aucun FAQ */}
      {questions.length === 0 && (
        <div className="text-center py-10 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <p className="text-2xl mb-2">🤖</p>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Aucun FAQ pour cette annonce</p>
          <p className="text-xs text-gray-400">Générez-en un automatiquement ou ajoutez des questions manuellement.</p>
        </div>
      )}

      {/* Liste des Q&R */}
      <div className="space-y-2">
        {questions.map((item, idx) => (
          <div key={idx}
            className={cn(
              'border rounded-2xl overflow-hidden transition-all',
              expandedIdx === idx
                ? 'border-[#f95d1e]/40 bg-orange-50/30 dark:bg-orange-950/10'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
            )}>
            {/* Question header */}
            <button
              onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="w-5 h-5 rounded-full bg-[#f95d1e]/10 text-[#f95d1e] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>
                <p className={cn('text-sm font-medium truncate',
                  item.q ? 'text-gray-800 dark:text-white' : 'text-gray-400 italic')}>
                  {item.q || 'Question sans titre…'}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); removeQuestion(idx) }}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                >
                  <Trash2 size={11} />
                </button>
                {expandedIdx === idx ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </div>
            </button>

            {/* Formulaire étendu */}
            {expandedIdx === idx && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                {/* Question */}
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Question</label>
                  <input
                    value={item.q}
                    onChange={e => updateQuestion(idx, 'q', e.target.value)}
                    placeholder="Ex: Quel est le prix de ce bien ?"
                    className="mt-1 w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-[#f95d1e] transition-colors"
                  />
                </div>

                {/* Réponse */}
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Réponse (avec émojis recommandés)</label>
                  <textarea
                    value={item.a}
                    onChange={e => updateQuestion(idx, 'a', e.target.value)}
                    placeholder="Ex: 💰 Le prix est de 150 000 FCFA/mois, négociable selon durée..."
                    rows={3}
                    className="mt-1 w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-[#f95d1e] transition-colors resize-none"
                  />
                </div>

                {/* Mots-clés */}
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Mots-clés déclencheurs <span className="text-gray-400 font-normal normal-case">(séparés par des virgules)</span>
                  </label>
                  <input
                    value={item.keywords.join(', ')}
                    onChange={e => updateKeywords(idx, e.target.value)}
                    placeholder="Ex: prix, coût, loyer, combien, tarif, montant"
                    className="mt-1 w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-[#f95d1e] transition-colors"
                  />
                  {item.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.keywords.map((kw, ki) => (
                        <span key={ki} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-full text-[10px]">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {questions.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {questions.length} question{questions.length > 1 ? 's' : ''} dans le FAQ
          {questions.length < 8 && ' — Recommandé : 12 à 15 questions'}
        </p>
      )}
    </div>
  )
}
