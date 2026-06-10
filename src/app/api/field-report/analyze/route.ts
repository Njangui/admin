import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY!,
    baseURL: 'https://api.deepseek.com/v1',
  })

  const { reportId, report } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const prompt = `Tu es l'IA stratégique de Habynex (plateforme immobilière à Yaoundé).
Analyse ce rapport terrain soumis par un agent/photographe et fournis une analyse concise (3-5 phrases) incluant :
- Points positifs de la journée
- Points d'attention ou problèmes à surveiller
- Recommandation actionnable pour l'admin

Rapport:
- Date: ${report.report_date}
- Missions effectuées: ${report.mission_count} (${report.successful_missions} réussies)
- Quartiers couverts: ${(report.neighborhoods_covered ?? []).join(', ')}
- Retours clients: ${report.client_feedback || 'Non renseigné'}
- Problèmes rencontrés: ${report.issues_encountered || 'Aucun'}
- Suggestions de l'agent: ${report.suggestions || 'Aucune'}
- Moral de la journée: ${report.mood_score}/5
- Transport: ${report.transport_mode || 'Non renseigné'}

Réponds en français, de façon directe et utile pour un directeur opérationnel.`

  try {
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const analysis = response.choices[0]?.message?.content ?? ''

    await supabase
      .from('field_reports')
      .update({ ai_analysis: analysis })
      .eq('id', reportId)

    return NextResponse.json({ success: true, analysis })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
