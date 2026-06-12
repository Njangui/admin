import { NextRequest, NextResponse } from 'next/server'
import {
  getDeepSeek, AI_MODEL, AI_MAX_TOKENS,
  SYSTEM_PROMPT_BASE, buildUserCriteriaContext, shouldEscalate,
} from '@/lib/ai/client'
import { createAdminClient } from '@/lib/supabase/server'
import type { FaqItem } from '../generate-faq/route'
import type { Listing, Message, UserCriteria } from '@/types'

// ================================================================
// POST /api/ai/chat — v2
// Ordre : escalade → FAQ (0 token) → attente admin 5min → IA fallback
// ================================================================

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? ''
const ADMIN_TIMEOUT_MS = 5 * 60 * 1000

// ── Correspondance FAQ ─────────────────────────────────────────────
function findFaqMatch(message: string, questions: FaqItem[]): string | null {
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const msg = normalize(message)

  for (const item of questions) {
    const matches = item.keywords.filter(kw => msg.includes(normalize(kw)))
    const hasStrong = matches.some(kw => kw.length > 5)
    if (matches.length >= 2 || (matches.length === 1 && hasStrong)) return item.a
  }
  return null
}

// ── Notifier tous les admins ───────────────────────────────────────
async function notifyAdmins(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  listingId: string,
  title: string,
  body: string,
) {
  const { data: admins } = await supabase
    .from('user_roles').select('user_id').in('role', ['admin', 'super_admin'])
  if (!admins?.length) return
  await supabase.from('notifications').insert(
    admins.map((a: { user_id: string }) => ({
      user_id: a.user_id,
      title,
      body,
      action_url: `${ADMIN_URL}/conversations?id=${conversationId}`,
      channel: 'in_app',
      metadata: { conversationId, listingId },
    }))
  )
}

// ── Snapshot annonce pour la carte ─────────────────────────────────
async function getListingSnapshot(supabase: ReturnType<typeof createAdminClient>, listingId: string) {
  const { data } = await supabase
    .from('listings')
    .select(`
      id, slug, title, price, price_negotiable, type, transaction,
      bedrooms, bathrooms, surface_m2, furnished, address_hint,
      neighborhood:neighborhoods!listings_neighborhood_id_fkey(name,
        city:cities!neighborhoods_city_id_fkey(name)
      ),
      media:listing_media(url, is_cover, display_order)
    `)
    .eq('id', listingId)
    .single()
  return data
}

export async function POST(req: NextRequest) {
  try {
    const {
      conversationId,
      message,
      listingContext,
    }: {
      conversationId: string
      message: string
      listingContext?: UserCriteria | null
    } = await req.json()

    if (!conversationId || !message)
      return NextResponse.json({ error: 'conversationId et message requis' }, { status: 400 })

    const supabase = createAdminClient()
    const now = new Date()

    const { data: conv } = await supabase
      .from('conversations')
      .select('id, listing_id, ai_active, claimed_by, last_user_msg_at, admin_notified_at')
      .eq('id', conversationId)
      .single()

    if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })

    // Mettre à jour horodatage dernier message utilisateur
    await supabase.from('conversations').update({
      last_user_msg_at: now.toISOString(),
      last_message_at: now.toISOString(),
      pending_ai_reply: true,
    }).eq('id', conversationId)

    // ── 1. Escalade urgente ──────────────────────────────────────────
    if (shouldEscalate(message)) {
      await supabase.from('conversations').update({
        ai_active: false,
        escalated_at: now.toISOString(),
        escalation_reason: 'Sujet sensible (argent/confirmation)',
        pending_ai_reply: false,
      }).eq('id', conversationId)

      await notifyAdmins(supabase, conversationId, conv.listing_id,
        '🚨 Escalade urgente',
        `Client: "${message.slice(0, 80)}"`)

      return NextResponse.json({
        reply: 'Je transfère votre demande à un conseiller Habynex qui vous répondra très rapidement. Merci pour votre patience ! 🙏',
        source: 'escalation',
        escalated: true,
      })
    }

    // ── 2. Admin a déjà pris en main → attente (max 5min) ────────────
    if (conv.claimed_by && !conv.ai_active) {
      const elapsed = now.getTime() - new Date(conv.last_user_msg_at ?? now).getTime()
      if (elapsed < ADMIN_TIMEOUT_MS) {
        // Encore dans le délai, on n'envoie rien
        return NextResponse.json({ reply: null, source: 'waiting_admin' })
      }
      // Délai dépassé → IA reprend
      await supabase.from('conversations')
        .update({ ai_active: true, claimed_by: null, claimed_at: null })
        .eq('id', conversationId)
    }

    // ── 3. Chercher dans le FAQ (0 token IA) ────────────────────────
    const { data: faq } = await supabase
      .from('listing_faqs').select('questions').eq('listing_id', conv.listing_id).single()

    if (faq?.questions?.length) {
      const faqAnswer = findFaqMatch(message, faq.questions as FaqItem[])
      if (faqAnswer) {
        // Insérer la réponse FAQ en DB pour la voir en realtime côté client
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: null,
          role: 'ai',
          content: faqAnswer,
        })
        await supabase.from('conversations')
          .update({ pending_ai_reply: false }).eq('id', conversationId)

        return NextResponse.json({ reply: faqAnswer, source: 'faq', escalated: false })
      }
    }

    // ── 4. Première notification admin + carte annonce ────────────────
    if (!conv.admin_notified_at) {
      await notifyAdmins(supabase, conversationId, conv.listing_id,
        '💬 Nouveau message client',
        `Question hors FAQ : "${message.slice(0, 80)}${message.length > 80 ? '…' : ''}"`)

      // Envoyer la carte annonce (metadata pour le composant ChatBox)
      const snap = await getListingSnapshot(supabase, conv.listing_id)
      if (snap) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: null,
          role: 'ai',
          content: '📋 Voici les informations du bien concerné',
          metadata: { type: 'listing_card', listing: snap },
        })
      }

      // Message d'attente pour l'utilisateur
      const waitMsg = '💬 Votre message a bien été reçu ! Un conseiller Habynex va vous répondre très prochainement. Notre assistant IA prendra le relais si aucune réponse dans 5 minutes. 🙏'
      await supabase.from('messages').insert({
        conversation_id: conversationId, sender_id: null, role: 'ai', content: waitMsg,
      })

      await supabase.from('conversations').update({
        admin_notified_at: now.toISOString(),
        ai_active: false,
        pending_ai_reply: true,
      }).eq('id', conversationId)

      return NextResponse.json({ reply: waitMsg, source: 'pending_admin', escalated: false })
    }

    // ── 5. Vérifier si délai 5min dépassé pour réponse IA ────────────
    const elapsed = now.getTime() - new Date(conv.admin_notified_at).getTime()
    if (elapsed < ADMIN_TIMEOUT_MS) {
      return NextResponse.json({ reply: null, source: 'waiting_admin' })
    }

    // ── 6. IA prend le relais (timeout admin) ────────────────────────
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .filter('metadata', 'is', null) // exclure les cartes annonce
      .order('created_at', { ascending: true })
      .limit(12)

    const criteriaCtx = buildUserCriteriaContext(listingContext as UserCriteria ?? null)

    const aiResponse = await getDeepSeek().chat.completions.create({
      model: AI_MODEL,
      max_tokens: AI_MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_BASE + criteriaCtx },
        ...(history ?? [])
          .filter((m: { role: string }) => m.role === 'user' || m.role === 'ai')
          .map((m: { role: string; content: string }) => ({
            role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant',
            content: m.content,
          })),
        { role: 'user', content: message },
      ],
    })

    const reply = aiResponse.choices[0]?.message?.content ?? ''

    await supabase.from('conversations')
      .update({ ai_active: true, pending_ai_reply: false })
      .eq('id', conversationId)

    await supabase.from('ai_logs').insert({
      action_type: 'message_response_timeout',
      conversation_id: conversationId,
      tokens_input: aiResponse.usage?.prompt_tokens ?? 0,
      tokens_output: aiResponse.usage?.completion_tokens ?? 0,
      escalated: false,
    })

    return NextResponse.json({ reply, source: 'ai_timeout', escalated: false })
  } catch (err) {
    console.error('ai/chat error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
