// @ts-ignore Deno resolves remote URL imports at runtime.
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
                You've been invited to <strong>${esc(tripTitle)}</strong> on Boarding Party.
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
        html: inviteEmailHtml(tripTitle, link),
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