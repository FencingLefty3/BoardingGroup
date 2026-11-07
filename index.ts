import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const deno = (globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined }
    serve(handler: (req: Request) => Response | Promise<Response>): void
  }
}).Deno

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

// invite emails contain a trip title typed by a user, so escape it before it goes into HTML
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => HTML_ESCAPES[c])

deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // fail loudly when a secret is missing, instead of sending broken emails
  const missing = ['RESEND_API_KEY', 'SITE_URL', 'FROM_EMAIL'].filter(name => !deno.env.get(name))
  if (missing.length) return json({ error: `Missing secrets: ${missing.join(', ')}` }, 500)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not signed in' }, 401)

  const { tripId } = await req.json().catch(() => ({}))
  if (!tripId) return json({ error: 'tripId is required' }, 400)

  // runs as the caller, so row-level security means only the trip owner can see these invites
  const supabase = createClient(
    deno.env.get('SUPABASE_URL')!,
    deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: invites, error } = await supabase
    .from('trip_invites')
    .select('id, email, token, trips(title)')
    .eq('trip_id', tripId)
    .eq('status', 'pending')
    .is('emailed_at', null)
  if (error) return json({ error: error.message }, 400)

  const siteUrl = deno.env.get('SITE_URL')!.replace(/\/$/, '')
  const sent: string[] = []
  const failed: { email: string; reason: string }[] = []

  for (const invite of invites ?? []) {
    const trip = invite.trips
    const tripTitle = (Array.isArray(trip) ? trip[0]?.title : trip?.title) ?? 'a trip'
    const link = `${siteUrl}/join.html?invite=${invite.token}`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: deno.env.get('FROM_EMAIL'),
        to: invite.email,
        subject: `You're invited to ${tripTitle}`,
        html: `<p>You've been invited to <b>${esc(tripTitle)}</b> on Boarding Party.</p>
               <p><a href="${link}">Join the trip</a></p>
               <p>No account yet? You'll be asked to create one first.</p>`,
      }),
    })

    if (!res.ok) {
      const reason = await res.text()
      console.error(`Resend rejected ${invite.email}: ${reason}`)   // shows up in the function's Logs tab
      failed.push({ email: invite.email, reason })
      continue
    }

    await supabase
      .from('trip_invites')
      .update({ emailed_at: new Date().toISOString() })
      .eq('id', invite.id)
    sent.push(invite.email)
  }

  return json({ sent, failed }, failed.length ? 502 : 200)
})