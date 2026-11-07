import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => htmlEscapes[character])
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const missing = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'RESEND_API_KEY',
    'SITE_URL',
    'FROM_EMAIL',
  ].filter(name => !Deno.env.get(name))
  if (missing.length) {
    console.error('Missing Edge Function secrets:', missing.join(', '))
    return json({ error: `Missing Edge Function secrets: ${missing.join(', ')}` }, 500)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Not signed in' }, 401)

  let body: { tripId?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Request body must be valid JSON' }, 400)
  }
  if (typeof body.tripId !== 'string' || !body.tripId) {
    return json({ error: 'tripId is required' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  )

  const { data: invites, error: inviteError } = await supabase
    .from('trip_invites')
    .select('id, email, token, trips(title)')
    .eq('trip_id', body.tripId)
    .eq('status', 'pending')
    .is('emailed_at', null)

  if (inviteError) {
    console.error('Could not load trip invites:', inviteError.message)
    return json({ error: inviteError.message }, 400)
  }

  const siteUrl = Deno.env.get('SITE_URL')!.replace(/\/$/, '')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')!
  const fromEmail = Deno.env.get('FROM_EMAIL')!
  const sent: string[] = []
  const failed: { email: string; reason: string }[] = []

  for (const invite of invites ?? []) {
    const trip = invite.trips
    const tripTitle = (Array.isArray(trip) ? trip[0]?.title : trip?.title) ?? 'a trip'
    const inviteUrl = `${siteUrl}/join.html?invite=${encodeURIComponent(invite.token)}`
    let response: Response

    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: invite.email,
          subject: `You're invited to ${tripTitle}`,
          html: `<p>You've been invited to <b>${escapeHtml(tripTitle)}</b> on Boarding Party.</p>
                 <p><a href="${inviteUrl}">Join the trip</a></p>
                 <p>No account yet? You'll be asked to create one first.</p>`,
        }),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Email request failed'
      console.error(`Resend request failed for ${invite.email}:`, reason)
      failed.push({ email: invite.email, reason })
      continue
    }

    if (!response.ok) {
      const reason = await response.text()
      console.error(`Resend rejected ${invite.email}: ${reason}`)
      failed.push({ email: invite.email, reason })
      continue
    }

    const { error: updateError } = await supabase
      .from('trip_invites')
      .update({ emailed_at: new Date().toISOString() })
      .eq('id', invite.id)
    if (updateError) {
      const reason = `Email sent, but invite status could not be updated: ${updateError.message}`
      console.error(reason)
      failed.push({ email: invite.email, reason })
      continue
    }

    sent.push(invite.email)
  }

  return json({ sent, failed }, failed.length ? 502 : 200)
})
