import { NextRequest, NextResponse } from 'next/server'
import { getDeepSeek, AI_MODEL, AI_MAX_TOKENS, SYSTEM_PROMPT_BASE, buildUserCriteriaContext } from '@/lib/ai/client'
import { createAdminClient } from '@/lib/supabase/server'

// ================================================================
// GET /api/cron/ai-pending-replies
// Appelé toutes les 2 minutes via Vercel Cron.
// Répond avec l'IA aux conversations en attente > 5 min sans réponse admin.
//
// vercel.json :
// { "crons": [{ "path": "/api/cron/ai-pending-replies", "schedule": "*/2 * * * *" }] }
// ================================================================

export async function GET(req: NextRequest) {
  // Sécurité Vercel Cron (header automatique) + secret custom
  const authHeader = req.headers.get('authorization')
  if (
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    req.headers.get('x-vercel-cron-signature') === null
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  // Conversations en attente de réponse IA (timeout admin dépassé)
  const { data: pending } = await supabase
    .from('conversations')
    .select(`
      id, listing_id, admin_notified_at,
      listing:listings!conversations_listing_id_fkey(
        title, type, transaction, price,
        neighborhood:neighborhoods!listings_neighborhood_id_fkey(name)
      )
    `)
    .eq('pending_ai_reply', true)
    .is('claimed_by', null)          // personne ne l'a pris en main
    .lt('admin_notified_at', fiveMinAgo)
    .limit(20)

  if (!pending?.length) return NextResponse.json({ processed: 0 })

  let processed = 0
  const errors: string[] = []

  for (const conv of pending) {
    try {
      // Récupérer l'historique récent
      const { data: msgs } = await supabase
        .from('messages')
        .select('role, content, created_at')
        .eq('conversation_id', conv.id)
        .is('metadata', null) // exclure cartes annonce
        .order('created_at', { ascending: false })
        .limit(14)

      if (!msgs?.length) continue
      const hasUserMsg = msgs.some((m: { role: string }) => m.role === 'user')
      if (!hasUserMsg) continue

      const listing = Array.isArray(conv.listing) ? conv.listing[0] : conv.listing as any
      const nbh = Array.isArray(listing?.neighborhood) ? listing?.neighborhood[0] : listing?.neighborhood as any

      const listingCtx = listing
        ? `\n\nBien immobilier : ${listing.title} — ${listing.type}, ${listing.transaction}, ${listing.price?.toLocaleString()} FCFA${nbh?.name ? ', ' + nbh.name : ''}`
        : ''

      const history = [...msgs].reverse()

      const aiResponse = await getDeepSeek().chat.completions.create({
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT_BASE + listingCtx +
              '\n\nNote : Le conseiller n\'a pas pu répondre dans les délais. Sois particulièrement attentionné et propose de relancer si besoin.',
          },
          ...history
            .filter((m: { role: string }) => m.role === 'user' || m.role === 'ai')
            .map((m: { role: string; content: string }) => ({
              role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant',
              content: m.content,
            })),
        ],
      })

      const reply = aiResponse.choices[0]?.message?.content ?? ''
      if (!reply) continue

      await supabase.from('messages').insert({
        conversation_id: conv.id,
        sender_id: null,
        role: 'ai',
        content: reply,
      })

      await supabase.from('conversations').update({
        ai_active: true,
        pending_ai_reply: false,
        last_message_at: new Date().toISOString(),
      }).eq('id', conv.id)

      await supabase.from('ai_logs').insert({
        action_type: 'cron_ai_fallback',
        conversation_id: conv.id,
        tokens_input: aiResponse.usage?.prompt_tokens ?? 0,
        tokens_output: aiResponse.usage?.completion_tokens ?? 0,
        escalated: false,
      })

      processed++
    } catch (err) {
      console.error(`Cron error conv ${conv.id}:`, err)
      errors.push(conv.id)
    }
  }

  return NextResponse.json({ processed, total: pending.length, errors: errors.length ? errors : undefined })
}
