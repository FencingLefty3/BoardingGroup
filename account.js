import { supabase } from './supabase.js'
import { requireAuth } from './guard.js'

const $ = id => document.getElementById(id)

const session = await requireAuth()
if (session) start(session)

async function start(session) {
    $('acctEmail').textContent = session.user.email

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', session.user.id)
        .single()

    const name = 
    profile?.display_name ||
    user.user_metadata?.username ||
    user.email.split('@')[0]

    $('displayName').textContent = name
    $('monogram').textContent = Array.from(name)[0].toUpperCase()

    $('logout').addEventListener('click', async e => {
        e.preventDefault
        await supabase.auth.signOut()
        location.replace('index.html')
    
    })
    
}

$('exit').addEventListener('click', () => {
    $('CreateTripDialog').close()
})
$('createTrip').addEventListener('click', event => {
    event.preventDefault()
    $('CreateTripDialog').showModal()
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_INVITES = 30

const inviteBox = document.getElementById('inviteBox')
const inviteInput = document.getElementById('inviteInput')
const chipsEl = inviteBox.querySelector('.chips')
const inviteHint = document.getElementById('inviteHint')

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


//-----------------------------------------Submit------------------------------------------//
