import { NextRequest, NextResponse } from 'next/server'
import { getDeepSeek, AI_MODEL } from '@/lib/ai/client'
import { createAdminClient } from '@/lib/supabase/server'
import type { Listing, Neighborhood, City } from '@/types'

// ================================================================
// POST /api/ai/generate-faq
// Génère 12-15 Q&R via DeepSeek pour une annonce.
// Appelé en fire-and-forget depuis AddListingForm après l'insert.
// ================================================================

export interface FaqItem {
  q: string
  a: string
  keywords: string[]
}

export async function POST(req: NextRequest) {
  try {
    const { listingId } = await req.json()
    if (!listingId) return NextResponse.json({ error: 'listingId requis' }, { status: 400 })

    const supabase = createAdminClient()

    // Vérifier si FAQ existe déjà
    const { data: existing } = await supabase
      .from('listing_faqs').select('id').eq('listing_id', listingId).single()
    if (existing) return NextResponse.json({ alreadyExists: true })

    // Récupérer l'annonce complète
    const { data: listing, error } = await supabase
      .from('listings')
      .select(`
        id, title, description, type, transaction, price, price_negotiable,
        bedrooms, bathrooms, surface_m2, floor, furnished, amenities, address_hint,
        neighborhood:neighborhoods!listings_neighborhood_id_fkey(
          id, name, city:cities!neighborhoods_city_id_fkey(id, name)
        )
      `)
      .eq('id', listingId)
      .single()

    if (error || !listing) return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })

    const nbh = Array.isArray(listing.neighborhood) ? listing.neighborhood[0] : listing.neighborhood as any
    const city = Array.isArray(nbh?.city) ? nbh?.city[0] : nbh?.city as any

    const amenitiesMap: Record<string, string> = {
      wifi: 'WiFi', parking: 'Parking', security: 'Sécurité 24h/24',
      water_24h: 'Eau courante 24h/24', electricity: 'Électricité AES/SONEL',
      generator: 'Groupe électrogène', air_conditioning: 'Climatisation',
      garden: 'Jardin', terrace: 'Terrasse',
    }
    const amenitiesList = listing.amenities
      ? Object.entries(listing.amenities)
          .filter(([, v]) => v === true)
          .map(([k]) => amenitiesMap[k] ?? k)
          .join(', ') || 'Standard'
      : 'Non précisés'

    const ctx = `
ANNONCE IMMOBILIÈRE HABYNEX
Titre : ${listing.title}
Type : ${listing.type} | Modalité : ${listing.transaction}
Prix : ${listing.price.toLocaleString()} FCFA${listing.price_negotiable ? ' (négociable)' : ' (prix ferme)'}
Quartier : ${nbh?.name ?? 'Non précisé'}, ${city?.name ?? 'Yaoundé'}, Cameroun
Adresse indicative : ${listing.address_hint ?? 'Non précisée'}
Chambres : ${listing.bedrooms ?? 'Non précisé'}
Salles de bain : ${listing.bathrooms ?? 'Non précisé'}
Surface : ${listing.surface_m2 ? listing.surface_m2 + ' m²' : 'Non précisée'}
Étage : ${listing.floor ?? 'Rez-de-chaussée'}
Meublé : ${listing.furnished ? 'OUI — bien entièrement meublé' : 'NON — non meublé'}
Équipements : ${amenitiesList}
Description : ${listing.description ?? 'Aucune description fournie'}
`.trim()

    const response = await getDeepSeek().chat.completions.create({
      model: AI_MODEL,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es expert immobilier pour Habynex au Cameroun.
Génère un FAQ précis (12 à 15 questions) pour cette annonce.
Ce FAQ servira à répondre AUTOMATIQUEMENT aux clients sans consommer de tokens IA.

CATÉGORIES OBLIGATOIRES (au moins une question chacune) :
1. Prix et négociation
2. Localisation et quartier  
3. Surface, étages, chambres
4. Équipements disponibles
5. Disponibilité et quand visiter
6. Organisation de la visite (coût: 3000 FCFA/bien)
7. Meublé ou non
8. Comment contacter / étapes
9. Charges et frais supplémentaires
10. Sécurité et environnement du quartier

RÈGLES :
- Réponses COMPLÈTES, CHALEUREUSES, avec émojis, en français
- Mots-clés : 5 à 8 par question, VARIÉS (synonymes, formulations alternatives)
- Si info manquante, donne une réponse utile générique sur le quartier/marché camerounais
- Ne jamais confirmer de RDV ni parler de commissions (escalade admin)

RETOURNE UNIQUEMENT ce JSON valide, rien d'autre :
{
  "questions": [
    {
      "q": "La question claire",
      "a": "La réponse complète avec émojis 😊",
      "keywords": ["mot1", "mot2", "synonyme", "formulation alternative"]
    }
  ]
}`,
        },
        { role: 'user', content: `Génère le FAQ pour cette annonce :\n\n${ctx}` },
      ],
    })

    const raw = response.choices[0]?.message?.content ?? '{}'
    let parsed: { questions: FaqItem[] }
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.error('FAQ parse error, raw:', raw.slice(0, 200))
      return NextResponse.json({ error: 'Erreur parsing FAQ IA' }, { status: 500 })
    }

    const questions: FaqItem[] = parsed.questions ?? []
    if (!questions.length) return NextResponse.json({ error: 'FAQ vide' }, { status: 500 })

    const { data: faq, error: ie } = await supabase
      .from('listing_faqs')
      .insert({ listing_id: listingId, questions, generated_by: 'ai' })
      .select('id').single()

    if (ie) {
      console.error('FAQ insert error:', ie)
      return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 })
    }

    // Log tokens IA
    await supabase.from('ai_logs').insert({
      action_type: 'faq_generation',
      conversation_id: null,
      tokens_input: response.usage?.prompt_tokens ?? 0,
      tokens_output: response.usage?.completion_tokens ?? 0,
      escalated: false,
    }).then(() => {})

    return NextResponse.json({ success: true, faqId: faq.id, count: questions.length })
  } catch (err) {
    console.error('generate-faq error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
