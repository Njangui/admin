import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY!,
    baseURL: 'https://api.deepseek.com/v1',
  })

  const { reports, date } = await req.json()

  const summary = reports.map((r: any) => {
    const profile = Array.isArray(r.profile) ? r.profile[0] : r.profile
    return `• ${profile?.full_name ?? 'Agent'} (${r.role_type ?? 'agent'}) : ${r.mission_count} missions, ${r.successful_missions} succès, moral ${r.mood_score}/5, quartiers: ${(r.neighborhoods_covered ?? []).join(', ')}, problèmes: ${r.issues_encountered || 'aucun'}, suggestions: ${r.suggestions || 'aucune'}`
  }).join('\n')

  const prompt = `Tu es le directeur stratégique de Habynex (immobilier à Yaoundé). Voici les rapports terrain du ${date}:

${summary}

Génère une synthèse stratégique en 5 parties distinctes:
1. **Performance globale** : résumé des chiffres clés (missions, taux de succès, moral moyen)
2. **Points forts** : ce qui a bien fonctionné aujourd'hui
3. **Points d'attention** : problèmes récurrents ou agents en difficulté
4. **Insights terrain** : informations importantes remontées du terrain (quartiers, marché, clients)
5. **Actions recommandées** : 2-3 actions concrètes à faire cette semaine

Sois direct, factuel, et orienté action. Réponds en français.`

  try {
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const analysis = response.choices[0]?.message?.content ?? ''
    return NextResponse.json({ success: true, analysis })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
