'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MapPin, Star, TrendingUp, Shield, ChevronRight,
  CheckCircle2, Upload, Loader2, ArrowRight, ArrowLeft
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ImageUploader } from '@/components/ui/ImageUploader'
import toast from 'react-hot-toast'

const QUESTIONS = [
  {
    id: 'experience',
    label: 'Avez-vous de l\'expérience dans l\'immobilier ou la vente ?',
    options: ['Oui, plusieurs années', 'Oui, un peu', 'Non, mais je suis motivé(e)', 'Non'],
  },
  {
    id: 'neighborhood',
    label: 'Dans quel quartier vivez-vous / souhaitez-vous couvrir ?',
    type: 'text',
    placeholder: 'Ex: Simbock, Biyem-Assi, Jouvence...',
  },
  {
    id: 'availability',
    label: 'Quelle est votre disponibilité hebdomadaire ?',
    options: ['Temps plein (5j/semaine)', 'Mi-temps (3j/semaine)', 'Week-ends uniquement', 'Variable'],
  },
  {
    id: 'vehicle',
    label: 'Disposez-vous d\'un moyen de transport ?',
    options: ['Moto personnelle', 'Voiture personnelle', 'Transport en commun', 'Aucun'],
  },
  {
    id: 'motivation',
    label: 'Pourquoi souhaitez-vous rejoindre Habynex ?',
    type: 'textarea',
    placeholder: 'Décrivez vos motivations en quelques lignes...',
  },
]

const COMMISSION_MODELS = [
  {
    key: 'A',
    title: 'Modèle A — Flexible',
    commission: '15%',
    extra: '+ Remboursement transport',
    desc: 'Idéal si vous débutez. Commission légèrement plus basse mais vos frais de déplacement sont couverts.',
    color: 'border-brand-200 dark:border-brand-800',
    badge: 'Recommandé',
    badgeColor: 'bg-brand-500 text-white',
  },
  {
    key: 'B',
    title: 'Modèle B — Premium',
    commission: '20%',
    extra: 'Sans remboursement transport',
    desc: 'Commission maximale. Vous gérez vous-même vos frais de déplacement.',
    color: 'border-gray-200 dark:border-gray-700',
    badge: '',
    badgeColor: '',
  },
]

export function DevenirAgentPage() {
  const { user, profile } = useAuthStore()
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(0) // 0=landing, 1=questions, 2=model, 3=docs, 4=success
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [questionIdx, setQuestionIdx] = useState(0)
  const [model, setModel] = useState<'A' | 'B'>('A')
  const [docFront, setDocFront] = useState<File | null>(null)
  const [docBack, setDocBack] = useState<File | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const currentQ = QUESTIONS[questionIdx]
  const allQAnswered = QUESTIONS.every(q => answers[q.id]?.trim())

  function handleAnswer(val: string) {
    setAnswers(prev => ({ ...prev, [currentQ.id]: val }))
    if (currentQ.type !== 'text' && currentQ.type !== 'textarea') {
      setTimeout(() => {
        if (questionIdx < QUESTIONS.length - 1) setQuestionIdx(i => i + 1)
      }, 280)
    }
  }

  async function submit() {
    if (!user) { router.push('/connexion'); return }
    if (!docFront || !docBack || !selfie) { toast.error('Veuillez uploader tous les documents requis'); return }
    setSubmitting(true)
    try {
      // Upload documents dans Supabase Storage
      const uploadFile = async (file: File, path: string) => {
        const { data } = await supabase.storage
          .from('verification-documents')
          .upload(`${user.id}/${path}`, file, { upsert: true })
        const { data: { publicUrl } } = supabase.storage
          .from('verification-documents')
          .getPublicUrl(data?.path ?? '')
        return publicUrl
      }

      const [frontUrl, backUrl, selfieUrl] = await Promise.all([
        uploadFile(docFront, 'id-front.jpg'),
        uploadFile(docBack, 'id-back.jpg'),
        uploadFile(selfie, 'selfie.jpg'),
      ])

      // Créer l'entrée agent
      const { error } = await supabase.from('agents').upsert({
        id: user.id,
        commission_model: model,
        status: 'pending',
        application_answers: answers,
        id_document_url: `${frontUrl}|||${backUrl}`,
        selfie_url: selfieUrl,
      })

      if (error) throw error

      // Attribuer le rôle (en attente de validation admin)
      setStep(4)
    } catch (err) {
      toast.error('Erreur lors de la soumission. Réessayez.')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Landing ──────────────────────────────────────────────────
  if (step === 0) return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-14">
        <span className="inline-flex items-center gap-2 px-4 py-2 bg-brand-50 dark:bg-brand-950 text-brand-500 rounded-full text-sm font-medium mb-5">
          <Shield size={14} /> Réseau d&apos;agents certifiés Habynex
        </span>
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4 leading-tight">
          Gagnez votre vie<br />
          <span className="text-brand-500">dans votre quartier</span>
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">
          Devenez agent terrain certifié Habynex. Accompagnez les candidats locataires, gagnez des commissions attractives et bénéficiez du support de notre IA.
        </p>
      </div>

      {/* Avantages style Airbnb */}
      <div className="grid md:grid-cols-3 gap-5 mb-12">
        {[
          { icon: MapPin, title: 'Votre quartier', desc: 'Travaillez uniquement dans la zone que vous connaissez le mieux. Moins de transport, plus d\'efficacité.' },
          { icon: TrendingUp, title: 'Commissions attractives', desc: '15% à 20% sur chaque transaction conclue, en plus du remboursement de vos frais selon votre modèle.' },
          { icon: Star, title: 'Support IA 24/7', desc: 'Notre assistant IA vous aide à planifier votre agenda, gérer vos RDV et vous améliorer chaque semaine.' },
        ].map(item => (
          <div key={item.title} className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-card">
            <div className="w-12 h-12 bg-brand-50 dark:bg-brand-950 rounded-2xl flex items-center justify-center mb-4">
              <item.icon size={22} className="text-brand-500" />
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">{item.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Comment ça marche */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-3xl p-8 mb-10">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 text-center">Comment ça marche ?</h2>
        <div className="space-y-5">
          {[
            { step: '1', title: 'Candidatez en ligne', desc: 'Répondez à quelques questions. Notre IA vous évalue et transmet votre dossier à l\'équipe Habynex.' },
            { step: '2', title: 'Vérification de votre identité', desc: 'Soumettez votre CNI recto/verso et un selfie tenant votre document. Traitement sous 48h.' },
            { step: '3', title: 'Validation et formation', desc: 'Un admin Habynex examine votre dossier et vous contacte. Une fois validé, vous êtes opérationnel.' },
            { step: '4', title: 'Vos premières missions', desc: 'Recevez vos premières demandes de visite, confirmez-les dans votre dashboard et commencez à gagner.' },
          ].map((item, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                {item.step}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{item.title}</p>
                <p className="text-gray-500 text-sm mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center">
        {user ? (
          <button
            onClick={() => setStep(1)}
            className="inline-flex items-center gap-2 px-8 py-4 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl transition-colors text-base shadow-lg hover:shadow-brand-500/30"
          >
            Candidater maintenant <ArrowRight size={18} />
          </button>
        ) : (
          <Link
            href="/inscription?redirect=/devenir-agent"
            className="inline-flex items-center gap-2 px-8 py-4 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl transition-colors text-base shadow-lg"
          >
            Créer un compte pour candidater <ArrowRight size={18} />
          </Link>
        )}
        <p className="text-xs text-gray-400 mt-3">Candidature gratuite · Aucun engagement initial</p>
      </div>
    </div>
  )

  // ── Questions ────────────────────────────────────────────────
  if (step === 1) return (
    <div className="max-w-xl mx-auto px-4 py-12">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
          <span>Question {questionIdx + 1} / {QUESTIONS.length}</span>
          <button onClick={() => setStep(0)} className="text-gray-400 hover:text-gray-600 transition-colors">Annuler</button>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-500"
            style={{ width: `${((questionIdx + 1) / QUESTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 shadow-card animate-fade-in">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{currentQ.label}</h2>

        {currentQ.options ? (
          <div className="space-y-2">
            {currentQ.options.map(opt => (
              <button
                key={opt}
                onClick={() => handleAnswer(opt)}
                className={cn(
                  'w-full px-5 py-3.5 rounded-2xl border-2 text-sm font-medium text-left transition-all',
                  answers[currentQ.id] === opt
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                )}
              >
                {answers[currentQ.id] === opt && <CheckCircle2 size={16} className="inline mr-2 text-brand-500" />}
                {opt}
              </button>
            ))}
          </div>
        ) : currentQ.type === 'textarea' ? (
          <textarea
            value={answers[currentQ.id] ?? ''}
            onChange={e => setAnswers(p => ({ ...p, [currentQ.id]: e.target.value }))}
            placeholder={currentQ.placeholder}
            rows={4}
            className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all resize-none"
          />
        ) : (
          <input
            type="text"
            value={answers[currentQ.id] ?? ''}
            onChange={e => setAnswers(p => ({ ...p, [currentQ.id]: e.target.value }))}
            placeholder={currentQ.placeholder}
            className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
        )}

        <div className="flex gap-3 mt-6">
          {questionIdx > 0 && (
            <button
              onClick={() => setQuestionIdx(i => i - 1)}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft size={16} /> Retour
            </button>
          )}
          {(currentQ.type === 'text' || currentQ.type === 'textarea') && (
            <button
              onClick={() => {
                if (!answers[currentQ.id]?.trim()) return
                if (questionIdx < QUESTIONS.length - 1) setQuestionIdx(i => i + 1)
                else setStep(2)
              }}
              disabled={!answers[currentQ.id]?.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white font-semibold rounded-2xl transition-colors text-sm"
            >
              {questionIdx === QUESTIONS.length - 1 ? 'Suivant' : 'Continuer'} <ArrowRight size={16} />
            </button>
          )}
          {currentQ.options && questionIdx === QUESTIONS.length - 1 && answers[currentQ.id] && (
            <button
              onClick={() => setStep(2)}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-brand-500 text-white font-semibold rounded-2xl transition-colors text-sm"
            >
              Continuer <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )

  // ── Choix du modèle ──────────────────────────────────────────
  if (step === 2) return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Choisissez votre modèle</h1>
        <p className="text-gray-500 text-sm">Ce choix peut être modifié ultérieurement par un admin sur demande.</p>
      </div>

      <div className="space-y-4 mb-8">
        {COMMISSION_MODELS.map(m => (
          <button
            key={m.key}
            onClick={() => setModel(m.key as 'A' | 'B')}
            className={cn(
              'w-full text-left p-6 rounded-3xl border-2 transition-all',
              model === m.key
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
                : `${m.color} bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600`
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-gray-900 dark:text-white">{m.title}</span>
                  {m.badge && <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', m.badgeColor)}>{m.badge}</span>}
                </div>
                <div className="text-3xl font-bold text-brand-500">{m.commission}</div>
                <div className="text-sm text-gray-500 mt-0.5">{m.extra}</div>
              </div>
              <div className={cn(
                'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-colors',
                model === m.key ? 'border-brand-500 bg-brand-500' : 'border-gray-300 dark:border-gray-600'
              )}>
                {model === m.key && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
              </div>
            </div>
            <p className="text-sm text-gray-500">{m.desc}</p>
          </button>
        ))}
      </div>

      <button
        onClick={() => setStep(3)}
        className="w-full flex items-center justify-center gap-2 py-4 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl transition-colors"
      >
        Continuer <ArrowRight size={18} />
      </button>
    </div>
  )

  // ── Upload documents ─────────────────────────────────────────
  if (step === 3) return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Vérification d&apos;identité</h1>
        <p className="text-gray-500 text-sm">Uploadez votre CNI ou passeport recto/verso + un selfie tenant votre document bien visible.</p>
      </div>

      <div className="space-y-4 mb-8">
        {[
          { key: 'front', label: '🪪 CNI / Passeport — Recto', setter: setDocFront, file: docFront },
          { key: 'back', label: '🔄 CNI / Passeport — Verso', setter: setDocBack, file: docBack },
          { key: 'selfie', label: '🤳 Selfie tenant le document', setter: setSelfie, file: selfie },
        ].map(item => (
          <div key={item.key}>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{item.label}</p>
            <ImageUploader
              maxFiles={1}
              maxSizeKB={300}
              label={item.file ? `✅ ${item.file.name}` : 'Cliquer ou glisser une image'}
              onFilesReady={files => item.setter(files[0] ?? null)}
            />
          </div>
        ))}
      </div>

      {/* Info sécurité */}
      <div className="flex gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl mb-6">
        <Shield size={16} className="text-brand-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500">Vos documents sont chiffrés et ne sont accessibles qu&apos;aux administrateurs Habynex pour la vérification.</p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setStep(2)}
          className="flex items-center gap-2 px-5 py-3.5 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={16} /> Retour
        </button>
        <button
          onClick={submit}
          disabled={!docFront || !docBack || !selfie || submitting}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white font-bold rounded-2xl transition-colors"
        >
          {submitting ? <><Loader2 size={16} className="animate-spin" /> Envoi en cours...</> : <>Soumettre ma candidature <ArrowRight size={16} /></>}
        </button>
      </div>
    </div>
  )

  // ── Succès ───────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="w-20 h-20 bg-trust-50 dark:bg-trust-950/30 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 size={36} className="text-trust-500" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Candidature envoyée ! 🎉</h1>
      <p className="text-gray-500 mb-8 leading-relaxed">
        Notre équipe examine votre dossier. Vous recevrez une réponse dans les <strong>48 heures</strong> ouvrées.
        Un admin vous contactera directement si votre profil est retenu.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-8 py-3.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl transition-colors"
      >
        Retour à l&apos;accueil <ChevronRight size={16} />
      </Link>
    </div>
  )
}
