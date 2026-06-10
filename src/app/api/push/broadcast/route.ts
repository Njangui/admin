import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { title, body, url, target_user_id } = await req.json()
  if (!title || !body) return NextResponse.json({ error: 'title et body requis' }, { status: 400 })

  // Appel Edge Function Supabase push-notifications
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/push-notifications`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ title, body, url, target_user_id }),
    }
  )

  const data = await res.json()

  // Logger
  await supabase.from('push_logs').insert({
    type: target_user_id ? 'targeted' : 'broadcast',
    title, message: body, url,
    target_user_id: target_user_id ?? null,
    sent_count: data.sent ?? 0,
    failed_count: data.failed ?? 0,
  })

  return NextResponse.json(data)
}
