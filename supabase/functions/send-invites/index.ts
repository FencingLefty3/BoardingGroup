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

function inviteEmailHtml(tripTitle: string, inviteUrl: string) {
  const background = '#c2c2c2'
  const foreground = '#3e4a60'
  const accent = '#5d5484'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>:root { color-scheme: light only; supported-color-schemes: light; }</style>
</head>
<body style="margin:0;padding:0;background-color:${background};color:${foreground};font-family:'Lucida Console','Courier New',monospace;">
  <table class="emailBackground" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${background}" style="width:100%;background-color:${background};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table class="emailCard" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${background}" style="width:100%;max-width:600px;background-color:${background};color:${foreground};">
          <tr>
            <td style="padding:24px;">
              <h1 style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:24px;color:${foreground};">Boarding Group</h1>
              <p style="margin:20px 0;color:${foreground};">
                You've been invited to <strong>${escapeHtml(tripTitle)}</strong> on Boarding Party.
              </p>
              <p style="margin:24px 0;">
                <a class="emailButton" href="${inviteUrl}" style="display:inline-block;padding:12px 16px;border-radius:8px;background-color:${accent};color:${background};font-family:'Lucida Console','Courier New',monospace;text-decoration:none;">Join the trip</a>
              </p>
              <p style="margin:0;color:${foreground};opacity:.7;font-size:13px;">
                No account yet? You'll be asked to create one first.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
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
          html: inviteEmailHtml(tripTitle, inviteUrl),
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
