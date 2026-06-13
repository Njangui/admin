/**
 * @/lib/ai/client
 * Client DeepSeek (via SDK OpenAI-compatible) + constantes IA pour Habynex Admin
 */

import OpenAI from 'openai'
import type { UserCriteria } from '@/types'

// ── Constantes ─────────────────────────────────────────────────────────────────
export const AI_MODEL = 'deepseek-chat'
export const AI_MAX_TOKENS = 600

// ── Singleton DeepSeek ─────────────────────────────────────────────────────────
let _deepseek: OpenAI | null = null

export function getDeepSeek(): OpenAI {
  if (!_deepseek) {
    _deepseek = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY!,
      baseURL: 'https://api.deepseek.com/v1',
    })
  }
  return _deepseek
}

// ── Prompt système de base ────────────────────────────────────────────────────
export const SYSTEM_PROMPT_BASE = `Tu es l'assistant IA de Habynex, la première plateforme immobilière du Cameroun.
Tu réponds aux questions des clients sur les annonces immobilières de façon chaleureuse, professionnelle et concise.

RÈGLES IMPORTANTES :
- Réponds TOUJOURS en français, avec des émojis appropriés 😊
- Sois chaleureux, rassurant et professionnel
- Ne confirme JAMAIS de rendez-vous ni ne donne de prix fermes — dis qu'un conseiller confirmera
- Ne parle JAMAIS de commissions, frais cachés ni de paiements directs
- Si tu ne sais pas, dis-le honnêtement et propose de transférer à un conseiller
- Les visites coûtent 3 000 FCFA par bien (frais de transport agent)
- Rappelle toujours que Habynex vérifie toutes ses annonces
- Maximum 3-4 phrases par réponse, sauf si une explication longue est vraiment nécessaire
`

// ── Mots-clés déclenchant une escalade vers un admin ─────────────────────────
const ESCALATION_KEYWORDS = [
  // Paiement / argent direct
  'virement', 'payer maintenant', 'envoyer l\'argent', 'mobile money', 'mtn money', 'orange money',
  'avance', 'caution', 'dépôt', 'acompte',
  // Confirmation / engagement
  'je prends', 'je veux signer', 'contrat', 'bail', 'réserver ce logement',
  // Urgence / pression
  'urgent', 'arnaque', 'escroquerie', 'faux', 'problème', 'plainte',
  // Contact direct
  'numéro de téléphone du propriétaire', 'adresse exacte',
]

export function shouldEscalate(message: string): boolean {
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return ESCALATION_KEYWORDS.some(kw =>
    lower.includes(kw.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  )
}

// ── Contexte critères utilisateur ────────────────────────────────────────────
export function buildUserCriteriaContext(criteria: UserCriteria | null): string {
  if (!criteria) return ''

  const parts: string[] = []

  if (criteria.types?.length) {
    parts.push(`Types recherchés : ${criteria.types.join(', ')}`)
  }
  if (criteria.transaction) {
    parts.push(`Modalité : ${criteria.transaction}`)
  }
  if (criteria.budget_min || criteria.budget_max) {
    const min = criteria.budget_min?.toLocaleString() ?? '0'
    const max = criteria.budget_max?.toLocaleString() ?? '∞'
    parts.push(`Budget : ${min} – ${max} FCFA`)
  }
  if (criteria.furnished !== undefined) {
    parts.push(`Meublé : ${criteria.furnished ? 'Oui' : 'Non'}`)
  }

  if (!parts.length) return ''

  return `\n\nCritères du client :\n${parts.map(p => `• ${p}`).join('\n')}`
}
