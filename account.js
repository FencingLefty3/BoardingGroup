import { supabase } from './supabase.js'
import { requireAuth } from './guard.js'
import { claimPendingInvite } from './invites.js'

const $ = id => document.getElementById(id)
const setAll = (selector, text) =>
  document.querySelectorAll(selector).forEach(el => { el.textContent = text })

const session = await requireAuth()

// ----------------------------------------------------------- page and profile

async function start(session) {
  const user = session.user

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const name =
    profile?.display_name ||
    user.user_metadata?.username ||
    user.email.split('@')[0]

  // both views (#home and #account) show these, so they are classes, not ids
  setAll('.acctEmail', user.email)
  setAll('.displayName', name)
  setAll('.monogram', Array.from(name)[0].toUpperCase())

  $('logout').addEventListener('click', async e => {
    e.preventDefault()
    await supabase.auth.signOut()
    location.replace('index.html')
  })

  // someone opened an invite link before logging in: join that trip now
  const claimed = await claimPendingInvite()
  if (claimed?.tripId) {
    location.replace(`app.html?id=${encodeURIComponent(claimed.tripId)}`)
    return
  }
  if (claimed?.error) alert('That invite link is invalid or has expired.')

  try {
    renderTrips(await listMyTrips(), user.id)
  } catch (err) {
    console.error(err)
    $('tripsInfo').textContent = 'Could not load your trips.'
  }
}

function renderPage() {
  const showAccount = window.location.hash === '#account'
  $('account').style.display = showAccount ? 'flex' : 'none'
  $('home').style.display = showAccount ? 'none' : 'flex'
}

window.addEventListener('hashchange', renderPage)
renderPage()

// ---------------------------------------------------------------- trip list

async function listMyTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select('id, title, start_date, end_date, trip_members(user_id, role, profiles(display_name))')
    .order('start_date', { ascending: true })
  if (error) throw error
  return data
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
})
const dateRange = (start, end) =>
  `${dateFmt.format(new Date(start))} – ${dateFmt.format(new Date(end))}`

function renderTrips(trips, myId) {
  const box = $('tripsInfo')
  box.replaceChildren()

  if (!trips.length) {
    box.textContent = 'No trips yet. Create one to get started.'
    return
  }

  const template = $('tripTemplate')
  for (const trip of trips) {
    const card = template.content.firstElementChild.cloneNode(true)
    card.href = `app.html?id=${encodeURIComponent(trip.id)}`

    const members = trip.trip_members ?? []
    const others = members
      .filter(member => member.user_id !== myId)
      .map(member => member.profiles?.display_name ?? 'Someone')
    const mine = members.find(member => member.user_id === myId)

    card.querySelector('.tripTitle').textContent = trip.title
    card.querySelector('.tripDates').textContent = dateRange(trip.start_date, trip.end_date)
    card.querySelector('.tripPeople').textContent = others.length
      ? others.slice(0, 3).join(', ') + (others.length > 3 ? ` +${others.length - 3} more` : '')
      : 'Just you'
    card.querySelector('.tripRole').textContent = mine?.role === 'owner' ? 'Owner' : 'Member'

    box.append(card)
  }
}

// ------------------------------------------------------- invite email chips

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_INVITES = 30

const inviteBox = $('inviteBox')
const inviteInput = $('inviteInput')
const chipsEl = inviteBox.querySelector('.chips')
const inviteHint = $('inviteHint')

const invitees = []

function renderChips() {
  chipsEl.replaceChildren()
  for (const email of invitees) {
    const chip = document.createElement('span')
    chip.className = 'chip'
    chip.append(email)

    const x = document.createElement('button')
    x.type = 'button'
    x.className = 'chipRemove'
    x.setAttribute('aria-label', `Remove ${email}`)
    x.textContent = '×'
    x.addEventListener('click', () => {
      invitees.splice(invitees.indexOf(email), 1)
      renderChips()
      inviteInput.focus()
    })

    chip.append(x)
    chipsEl.append(chip)
  }
}

function addInvitees(raw) {
  const bad = []
  let full = false
  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase()
    if (!email) continue
    if (!EMAIL_RE.test(email)) bad.push(email)
    else if (invitees.includes(email)) continue
    else if (invitees.length >= MAX_INVITES) full = true
    else invitees.push(email)
  }
  renderChips()
  inviteHint.textContent = bad.length
    ? `Not a valid email: ${bad.join(', ')}`
    : full ? `You can invite up to ${MAX_INVITES} people.` : ''
  return bad
}

function commitInput() {
  if (!inviteInput.value.trim()) return
  inviteInput.value = addInvitees(inviteInput.value).join(' ')   // invalid text stays to be fixed
}

inviteInput.addEventListener('keydown', e => {
  if (['Enter', ',', ' ', 'Tab'].includes(e.key) && inviteInput.value.trim()) {
    e.preventDefault()                          // stops Enter from submitting the form
    commitInput()
  } else if (e.key === 'Backspace' && !inviteInput.value && invitees.length) {
    invitees.pop()                              // delete the last chip
    renderChips()
  }
})

inviteInput.addEventListener('blur', commitInput)

inviteInput.addEventListener('paste', e => {
  e.preventDefault()
  addInvitees(e.clipboardData.getData('text'))
  inviteInput.value = ''
})

inviteBox.addEventListener('click', () => inviteInput.focus())

export function getInviteEmails() {
  commitInput()
  return { emails: [...invitees], hasInvalid: inviteInput.value.trim() !== '' }
}

function resetInvites() {
  invitees.length = 0
  renderChips()
  inviteInput.value = ''
  inviteHint.textContent = ''
}

// ------------------------------------------------------------ create trip

let createdTripId = null      // lets a retry skip re-creating the trip

$('exit').addEventListener('click', () => $('CreateTripDialog').close())

$('createTrip').addEventListener('click', e => {
  e.preventDefault()
  $('createTripForm').reset()
  resetInvites()
  $('signUpMsg').textContent = ''
  createdTripId = null
  $('NewEndDate').min = ''
  $('CreateTripDialog').showModal()
})

$('NewStartDate').addEventListener('change', () => {
  const start = $('NewStartDate').value
  $('NewEndDate').min = start
  if ($('NewEndDate').value && $('NewEndDate').value < start) $('NewEndDate').value = start
})

$('createTripForm').addEventListener('submit', async e => {
  e.preventDefault()
  if (!session) return

  const msg = $('signUpMsg')
  const btn = e.target.querySelector('button[type="submit"]')
  msg.textContent = ''

  const title = $('NewTripTitle').value.trim()
  const start = $('NewStartDate').value
  const end = $('NewEndDate').value

  if (!title) {
    msg.textContent = 'Enter Name!'
    return
  }
  if (end < start) {
    msg.textContent = 'The end date must be on or after the start date.'
    return
  }

  const { emails, hasInvalid } = getInviteEmails()
  if (hasInvalid) {
    msg.textContent = 'Invalid invite email(s).'
    return
  }

  const me = session.user.email.toLowerCase()
  const toInvite = emails.filter(addr => addr !== me)     // no inviting yourself

  btn.disabled = true
  try {
    // 1) create the trip (the database also makes you its owner)
    if (!createdTripId) {
      const { data: tripId, error } = await supabase.rpc('create_trip', {
        p_title: title, p_start: start, p_end: end
      })
      if (error) throw error
      createdTripId = tripId
    }

    // 2) save the invites, then 3) email them
    if (toInvite.length) {
      const { error: invErr } = await supabase.from('trip_invites').upsert(
        toInvite.map(email => ({ trip_id: createdTripId, email })),
        { onConflict: 'trip_id,email', ignoreDuplicates: true }
      )
      if (invErr) throw invErr

      // the invites are already saved if this step fails
      const { error: fnErr } = await supabase.functions.invoke('send-invites', {
        body: { tripId: createdTripId }
      })
      if (fnErr) {
        let detail = null
        try { detail = await fnErr.context.json() } catch {}      // the body the function (or Supabase) sent back
        console.error(fnErr.name, fnErr.message, detail)
        alert(`Your trip was created, but the invite emails could not be sent.\n\n${detail?.error ?? detail?.message ?? fnErr.message}`)
      }
    }

    $('CreateTripDialog').close()
    location.href = `app.html?id=${encodeURIComponent(createdTripId)}`
  } catch (err) {
    msg.textContent = err.message || 'Something went wrong. Please try again.'
  } finally {
    btn.disabled = false
  }
})

// last on purpose: every const above must be initialized before start() runs
if (session) start(session)