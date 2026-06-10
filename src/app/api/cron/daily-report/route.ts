import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com/v1',
})

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().split('T')[0]

  const { data: existing } = await supabase
    .from('daily_reports').select('id').eq('report_date', today).single()
  if (existing) {
    return NextResponse.json({ message: 'Rapport déjà généré', id: existing.id })
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString()
  const [
    { count: newUsers }, { count: messages }, { count: bookings },
    { count: publishedListings }, { count: visitsCompleted },
    { data: commDue }, { count: activeAgents }, { count: pendingAgents },
    { count: pendingListings }, { count: escalatedConvs },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
    supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
    supabase.from('visit_bookings').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('visit_bookings').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', yesterday),
    supabase.from('commissions').select('total_commission').eq('status', 'due'),
    supabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).not('escalated_to', 'is', null),
  ])

  const revenueEstimate = (commDue ?? []).reduce((s: number, c: any) => s + (c.total_commission ?? 0), 0)
  const kpi_snapshot = {
    new_users: newUsers ?? 0, messages_sent: messages ?? 0, bookings: bookings ?? 0,
    published_listings: publishedListings ?? 0, visits_completed: visitsCompleted ?? 0,
    revenue_estimate: revenueEstimate, active_agents: activeAgents ?? 0,
  }

  let content = ''
  let suggestions: any[] = []

  try {
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Tu es l'IA de Habynex (immobilier Yaoundé). KPIs du ${today}: ${JSON.stringify(kpi_snapshot)}, agents en attente: ${pendingAgents}, annonces à valider: ${pendingListings}, convs escaladées: ${escalatedConvs}. Génère un rapport JSON: {"summary":"...","suggestions":[{"type":"pricing|marketing|agent|security|general","title":"...","description":"...","priority":"low|medium|high"}]}. JSON pur, sans backticks.`
      }]
    })
    const raw = response.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    content = parsed.summary ?? raw
    suggestions = parsed.suggestions ?? []
  } catch {
    content = `Rapport du ${today}. ${kpi_snapshot.new_users} nouveaux users, ${kpi_snapshot.bookings} réservations, ${kpi_snapshot.visits_completed} visites.`
  }

  const { data: report, error } = await supabase.from('daily_reports').insert({
    report_date: today, content, suggestions, kpi_snapshot,
    generated_at: new Date().toISOString(), read_by: [],
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: admins } = await supabase.from('user_roles').select('user_id').in('role', ['admin', 'super_admin'])
  if (admins?.length) {
    await supabase.from('notifications').insert(
      admins.map((a: any) => ({
        user_id: a.user_id, title: '📊 Rapport quotidien disponible',
        body: content.slice(0, 100) + '…',
        action_url: `${process.env.NEXT_PUBLIC_APP_URL}/rapports`, channel: 'in_app',
      }))
    )
  }

  return NextResponse.json({ success: true, id: report.id, kpi_snapshot })
}
