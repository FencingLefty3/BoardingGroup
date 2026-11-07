import { supabase } from './supabase.js'
import { requireAuth } from './guard.js'

const $ = id => document.getElementById(id)
const suggestionColors = ['#f4c7c3', '#f7df9b', '#c8e3c2', '#c5d9f2', '#e0cef2', '#f4d2a8']
let calendar = null

const dialogs = [...document.querySelectorAll('dialog')]
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return

  const openDialogs = dialogs.filter(dialog => dialog.open)
  if (!openDialogs.length) return

  event.preventDefault()
  openDialogs.forEach(dialog => dialog.close())
})

dialogs.forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close()
  })
})

//const session = await requireAuth()
//if (session) start(session)

$('exit').addEventListener('click', () => $('SuggestionDialog').close())

$('addSuggestion').addEventListener('click', e => {
  e.preventDefault()
  $('createSuggestionForm').reset()
  $('SuggestionDialog').showModal()
})
$('editButton').addEventListener('click', e => {
  e.preventDefault()
  if (!currentTrip) return

  $('editTripForm').reset()
  $('NewTripTitle').value = currentTrip.title
  $('NewStartDate').value = currentTrip.start_date
  $('NewEndDate').value = currentTrip.end_date
  $('NewEndDate').min = currentTrip.start_date
  $('editTripMessage').textContent = ''
  $('editTripDialog').showModal()
})
$('createEvent').addEventListener('click', e => {
  e.preventDefault()
  $('newEventForm').reset()
  resetEventLocationSearches()
  $('eventType').value = 'food'
  $('eventTypeIcon').src = 'utensils.png'
  $('eventTypeLabel').textContent = 'Food'
  updateEventTypeFields()
  $('newEventMessage').textContent = ''
  $('newEventDialog').showModal()
})
$('share').addEventListener('click', async () => {
  $('shareStatus').textContent = ''
  $('sharedPeopleList').replaceChildren()
  $('pendingInvitesList').replaceChildren()
  $('shareDialog').showModal()
  await loadSharingDetails()
})
$('closeShareDialog').addEventListener('click', () => $('shareDialog').close())
$('leftCal').addEventListener('click', () => calendar?.prev())
$('rightCal').addEventListener('click', () => calendar?.next())

const eventTypeToggle = $('eventTypeToggle')
const eventTypeMenu = $('eventTypeMenu')

eventTypeToggle.addEventListener('click', () => {
  const isExpanded = eventTypeToggle.getAttribute('aria-expanded') === 'true'
  eventTypeToggle.setAttribute('aria-expanded', String(!isExpanded))
  eventTypeMenu.hidden = isExpanded
})

eventTypeMenu.addEventListener('click', event => {
  const option = event.target.closest('[data-event-type]')
  if (!option) return

  $('eventType').value = option.dataset.eventType
  $('eventTypeIcon').src = option.dataset.icon
  $('eventTypeLabel').textContent = option.dataset.label
  eventTypeToggle.setAttribute('aria-expanded', 'false')
  eventTypeMenu.hidden = true
  updateEventTypeFields()
  eventTypeToggle.focus()
})

document.addEventListener('click', event => {
  if (!eventTypeMenu.hidden && !event.target.closest('.eventTypePicker')) {
    eventTypeMenu.hidden = true
    eventTypeToggle.setAttribute('aria-expanded', 'false')
  }
})

function updateEventTypeFields() {
  const isFlight = $('eventType').value === 'flight'
  $('generalLocationFields').hidden = isFlight
  $('flightAirportFields').hidden = !isFlight
  $('eventSearchLabel').textContent = isFlight ? 'Search Airports:' : 'Search Location:'
  $('eventLocation').required = !isFlight
  $('departureAirport').required = isFlight
  $('arrivalAirport').required = isFlight
  $('eventDateTime').required = true
  $('eventDateTimeLabel').textContent = isFlight ? 'Departure date and time' : 'Date and time'

  resetEventLocationSearches()
}

$('NewStartDate').addEventListener('change', () => {
  $('NewEndDate').min = $('NewStartDate').value
})

$('editTripForm').addEventListener('submit', async e => {
  e.preventDefault()

  if (!tripId || !currentTrip) return

  const title = $('NewTripTitle').value.trim()
  const startDate = $('NewStartDate').value
  const endDate = $('NewEndDate').value
  const message = $('editTripMessage')

  if (!title || !startDate || !endDate || endDate < startDate) {
    message.textContent = 'Enter a title and a valid trip date range.'
    return
  }

  const submitButton = e.currentTarget.querySelector('button[type="submit"]')
  submitButton.disabled = true
  message.textContent = ''
  try {
    const { data, error } = await supabase
      .from('trips')
      .update({ title, start_date: startDate, end_date: endDate })
      .eq('id', tripId)
      .select('id, title, start_date, end_date')
      .single()

    if (error) throw error
    currentTrip = data
    $('tripTitle').textContent = data.title
    $('editTripDialog').close()
  } catch (error) {
    console.error('Could not update trip:', error)
    message.textContent = `Could not update trip: ${error.message}`
  } finally {
    submitButton.disabled = false
  }
})

$('deleteTripButton').addEventListener('click', async () => {
  if (!tripId || !currentTrip) return
  if (!window.confirm(`Permanently delete "${currentTrip.title}"? This cannot be undone.`)) return

  const button = $('deleteTripButton')
  const message = $('editTripMessage')
  const formButtons = $('editTripForm').querySelectorAll('button')
  formButtons.forEach(formButton => { formButton.disabled = true })
  message.textContent = ''

  try {
    const { count, error } = await supabase
      .from('trips')
      .delete({ count: 'exact' })
      .eq('id', tripId)

    if (error) throw error
    if (count !== 1) {
      throw new Error('No trip was deleted. Check the trips DELETE permission and row-level security policy for trip owners.')
    }

    location.replace('account.html')
  } catch (error) {
    console.error('Could not delete trip:', error)
    message.textContent = `Could not delete trip: ${error.message}`
    formButtons.forEach(formButton => { formButton.disabled = false })
  }
})

$('createSuggestionForm').addEventListener('submit', async e => {
  e.preventDefault()

  if (!tripId || !currentTrip) {
    $('signUpMsg').textContent = 'Select a trip before adding a suggestion.'
    return
  }

  const title = $('NewSuggestionTitle').value.trim()
  const comment = $('commentInput').value.trim()
  if (!title) return

  const form = e.currentTarget
  const submitButton = form.querySelector('button[type="submit"]')
  submitButton.disabled = true
  $('signUpMsg').textContent = ''

  try {
    const color = suggestionColors[Math.floor(Math.random() * suggestionColors.length)]
    const { data, error } = await supabase
      .from('trip_suggestions')
      .insert({ trip_id: tripId, title, comment, color })
      .select('id, title, comment, color')
      .single()

    if (error) throw error

    renderSuggestion(data)
    form.reset()
    $('SuggestionDialog').close()
  } catch (error) {
    console.error('Could not save suggestion:', error)
    $('signUpMsg').textContent = `Could not save suggestion: ${error.message}`
  } finally {
    submitButton.disabled = false
  }
})

function renderSuggestion(suggestion) {
  const card = document.createElement('article')
  card.className = 'suggestionCard'
  card.style.backgroundColor = suggestionColors.includes(suggestion.color)
    ? suggestion.color
    : suggestionColors[0]

  const heading = document.createElement('h3')
  heading.textContent = suggestion.title
  card.append(heading)

  if (suggestion.comment) {
    const description = document.createElement('p')
    description.textContent = suggestion.comment
    card.append(description)
  }

  $('suggestionBoard').append(card)
}

async function loadTripSuggestions() {
  $('suggestionMessage').textContent = ''
  $('suggestionBoard').replaceChildren()
  if (!tripId) return

  try {
    const { data, error } = await supabase
      .from('trip_suggestions')
      .select('id, title, comment, color')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })

    if (error) throw error
    data.forEach(renderSuggestion)
  } catch (error) {
    console.error('Could not load suggestions:', error)
    $('suggestionMessage').textContent = `Could not load suggestions: ${error.message}`
  }
}

const tripId = new URLSearchParams(window.location.search).get('id')
let currentTrip = null
let currentTripRole = null
async function loadTripTitle() {
  if (!tripId) {
    $('tripTitle').textContent = 'No trip selected'
    $('editButton').hidden = true
    return
  }

  try {
    const { data, error } = await supabase
      .from('trips')
      .select('id, title, start_date, end_date')
      .eq('id', tripId)
      .single()

    if (error) throw error
    currentTrip = data
    $('tripTitle').textContent = data.title
    $('eventDateTime').min = `${data.start_date}T00:00`
    $('eventDateTime').max = `${data.end_date}T23:59`
    calendar?.gotoDate(data.start_date)
    await loadTripDeletePermission()
    await loadTripSuggestions()
    await loadTripEvents()
  } catch (error) {
    console.error('Could not load trip title:', error)
    $('editButton').hidden = true
  }
}

async function loadTripDeletePermission() {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) {
    console.error('Could not check trip ownership:', userError)
    currentTripRole = null
    $('deleteTripButton').hidden = true
    return
  }
  if (!user) {
    currentTripRole = null
    $('deleteTripButton').hidden = true
    return
  }

  const { data, error } = await supabase
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('Could not check trip ownership:', error)
    currentTripRole = null
    $('deleteTripButton').hidden = true
    return
  }
  currentTripRole = data?.role ?? null
  $('deleteTripButton').hidden = currentTripRole !== 'owner'
}

function addSharedPersonRow(member, currentUserId) {
  const row = document.createElement('li')
  row.className = 'sharingListItem'

  const name = document.createElement('span')
  const displayName = member.profiles?.display_name || 'Trip member'
  name.textContent = `${displayName}${member.user_id === currentUserId ? ' (you)' : ''} · ${member.role}`
  row.append(name)

  if (currentTripRole === 'owner' && member.role !== 'owner' && member.user_id !== currentUserId) {
    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.className = 'removeSharedPerson'
    removeButton.textContent = 'Remove'
    removeButton.addEventListener('click', () => removeSharedPerson(member, removeButton))
    row.append(removeButton)
  }

  $('sharedPeopleList').append(row)
}

async function loadSharingDetails() {
  if (!tripId || !currentTrip) {
    $('shareStatus').textContent = 'Select a trip before managing who it is shared with.'
    return
  }

  $('shareStatus').textContent = 'Loading people…'
  try {
    await loadTripDeletePermission()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError

    const { data: members, error: membersError } = await supabase
      .from('trip_members')
      .select('user_id, role, profiles(display_name)')
      .eq('trip_id', tripId)
      .order('role', { ascending: true })

    if (membersError) throw membersError

    $('sharedPeopleList').replaceChildren()
    const sharedMembers = members ?? []
    sharedMembers.forEach(member => addSharedPersonRow(member, user?.id))
    if (!sharedMembers.length) {
      const empty = document.createElement('li')
      empty.textContent = 'No members found.'
      $('sharedPeopleList').append(empty)
    }

    const canManageSharing = currentTripRole === 'owner'
    $('invitePersonForm').hidden = !canManageSharing
    $('pendingInvitesSection').hidden = !canManageSharing

    if (canManageSharing) {
      const { data: invites, error: invitesError } = await supabase
        .from('trip_invites')
        .select('id, email, status, emailed_at')
        .eq('trip_id', tripId)
        .eq('status', 'pending')
        .order('email', { ascending: true })

      if (invitesError) throw invitesError
      $('pendingInvitesList').replaceChildren()
      const pendingInvites = invites ?? []
      pendingInvites.forEach(invite => {
        const row = document.createElement('li')
        row.textContent = `${invite.email}${invite.emailed_at ? ' · email sent' : ' · not sent yet'}`
        $('pendingInvitesList').append(row)
      })
      if (!pendingInvites.length) {
        const empty = document.createElement('li')
        empty.textContent = 'No outstanding invitations.'
        $('pendingInvitesList').append(empty)
      }
    }

    $('shareStatus').textContent = ''
  } catch (error) {
    console.error('Could not load trip sharing details:', error)
    $('shareStatus').textContent = `Could not load sharing details: ${error.message}`
  }
}

async function removeSharedPerson(member, button) {
  if (currentTripRole !== 'owner' || member.role === 'owner') return
  if (!window.confirm(`Remove ${member.profiles?.display_name || 'this person'} from the trip?`)) return

  button.disabled = true
  $('shareStatus').textContent = ''
  try {
    const { count, error } = await supabase
      .from('trip_members')
      .delete({ count: 'exact' })
      .eq('trip_id', tripId)
      .eq('user_id', member.user_id)

    if (error) throw error
    if (count !== 1) throw new Error('No member was removed. Check the trip_members DELETE permission and row-level security policy.')

    await loadSharingDetails()
  } catch (error) {
    console.error('Could not remove trip member:', error)
    $('shareStatus').textContent = `Could not remove person: ${error.message}`
    button.disabled = false
  }
}

$('invitePersonForm').addEventListener('submit', async event => {
  event.preventDefault()
  if (currentTripRole !== 'owner' || !tripId || !currentTrip) return

  const email = $('invitePersonEmail').value.trim().toLowerCase()
  const button = event.currentTarget.querySelector('button[type="submit"]')
  button.disabled = true
  $('shareStatus').textContent = ''

  try {
    const { error: inviteError } = await supabase
      .from('trip_invites')
      .upsert(
        { trip_id: tripId, email, status: 'pending', emailed_at: null },
        { onConflict: 'trip_id,email' }
      )

    if (inviteError) throw inviteError

    const { data, error: sendError } = await supabase.functions.invoke('send-invites', {
      body: { tripId }
    })
    if (sendError) {
      let detail = sendError.message
      if (sendError.context instanceof Response) {
        const responseText = await sendError.context.text()
        try {
          const responseBody = JSON.parse(responseText)
          detail = responseBody.error ?? responseBody.message ?? responseText
        } catch {
          detail = responseText || detail
        }
      }
      throw new Error(`Invite saved, but email could not be sent: ${detail}`)
    }
    if (data?.failed?.length) {
      throw new Error(`Invite saved, but email could not be sent: ${data.failed.map(item => `${item.email}: ${item.reason}`).join('; ')}`)
    }

    $('invitePersonEmail').value = ''
    await loadSharingDetails()
    $('shareStatus').textContent = `Invitation sent to ${email}.`
  } catch (error) {
    console.error('Could not invite person to trip:', error)
    const message = error.message
    await loadSharingDetails()
    $('shareStatus').textContent = message
  } finally {
    button.disabled = false
  }
})

function getEventLocation(notes, title) {
  if (!notes) return ''

  const withoutCoordinates = value => value
    .replace(/\s*\(-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?\)$/, '')
    .trim()
  const departure = notes.match(/^Departure airport:\s*(.+)$/m)
  const arrival = notes.match(/^Arrival airport:\s*(.+)$/m)

  if (departure && arrival) {
    return `Departure: ${withoutCoordinates(departure[1])} · Arrival: ${withoutCoordinates(arrival[1])}`
  }

  const location = withoutCoordinates(notes.split(/\r?\n/)[0])
  return title && location.startsWith(`${title},`)
    ? location.slice(title.length + 1).trim()
    : location === title ? '' : location
}

async function loadTripEvents() {
  try {
    const { data, error } = await supabase
      .from('trip_events')
      .select('id, title, notes, starts_at, ends_at')
      .eq('trip_id', tripId)
      .order('starts_at', { ascending: true })

    if (error) throw error

    calendar.removeAllEvents()
    data.forEach(event => {
      calendar.addEvent({
        id: event.id,
        title: event.title,
        start: event.starts_at,
        end: event.ends_at,
        extendedProps: {
          notes: event.notes,
          location: getEventLocation(event.notes, event.title)
        }
      })
    })
    $('calendarMessage').textContent = ''
  } catch (error) {
    console.error('Could not load trip events:', error)
    $('calendarMessage').textContent = `Could not load events: ${error.message}`
  }
}

let eventBeingEdited = null

function toLocalDateTimeValue(value) {
  const date = new Date(value)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function openEventEditor(event) {
  eventBeingEdited = event
  $('editEventTitle').value = event.title
  $('editEventLocation').value = event.extendedProps.location || ''
  $('editEventStart').value = toLocalDateTimeValue(event.start)
  $('editEventEnd').value = toLocalDateTimeValue(event.end || event.start)
  $('editEventMessage').textContent = ''
  $('eventDetailsDialog').showModal()
}

function setEventEditorBusy(isBusy) {
  $('eventDetailsForm').querySelectorAll('button').forEach(button => {
    button.disabled = isBusy
  })
}

$('eventDetailsForm').addEventListener('submit', async event => {
  event.preventDefault()
  if (!eventBeingEdited || !tripId) return

  const title = $('editEventTitle').value.trim()
  const notes = $('editEventLocation').value.trim()
  const start = new Date($('editEventStart').value)
  const end = new Date($('editEventEnd').value)
  const message = $('editEventMessage')

  if (!title || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    message.textContent = 'Enter a name and a valid time range. The end must be after the start.'
    return
  }
  if (currentTrip && (
    $('editEventStart').value.slice(0, 10) < currentTrip.start_date ||
    $('editEventStart').value.slice(0, 10) > currentTrip.end_date ||
    $('editEventEnd').value.slice(0, 10) < currentTrip.start_date ||
    $('editEventEnd').value.slice(0, 10) > currentTrip.end_date
  )) {
    message.textContent = 'The event must be within the trip dates.'
    return
  }

  setEventEditorBusy(true)
  message.textContent = ''
  try {
    const { data, error } = await supabase
      .from('trip_events')
      .update({
        title,
        notes,
        starts_at: start.toISOString(),
        ends_at: end.toISOString()
      })
      .eq('id', eventBeingEdited.id)
      .eq('trip_id', tripId)
      .select('id, title, notes, starts_at, ends_at')
      .single()

    if (error) throw error

    eventBeingEdited.setProp('title', data.title)
    eventBeingEdited.setStart(data.starts_at)
    eventBeingEdited.setEnd(data.ends_at)
    eventBeingEdited.setExtendedProp('notes', data.notes)
    eventBeingEdited.setExtendedProp('location', getEventLocation(data.notes, data.title))
    $('eventDetailsDialog').close()
  } catch (error) {
    console.error('Could not update event:', error)
    message.textContent = `Could not save event: ${error.message}`
  } finally {
    setEventEditorBusy(false)
  }
})

$('deleteEvent').addEventListener('click', async () => {
  if (!eventBeingEdited || !tripId) return
  if (!window.confirm(`Delete "${eventBeingEdited.title}"? This cannot be undone.`)) return

  const message = $('editEventMessage')
  setEventEditorBusy(true)
  message.textContent = ''
  try {
    const { count, error } = await supabase
      .from('trip_events')
      .delete({ count: 'exact' })
      .eq('id', eventBeingEdited.id)
      .eq('trip_id', tripId)

    if (error) throw error
    if (count !== 1) {
      throw new Error('No event was deleted. Apply the Supabase migration 20261107100000_allow_trip_members_to_delete_trip_events.sql, then try again.')
    }

    eventBeingEdited.remove()
    $('eventDetailsDialog').close()
  } catch (error) {
    console.error('Could not delete event:', error)
    message.textContent = error.code === '42501'
      ? 'Supabase denied deletion. Apply the migration 20261107100000_allow_trip_members_to_delete_trip_events.sql and try again.'
      : `Could not delete event: ${error.message}`
  } finally {
    setEventEditorBusy(false)
  }
})

$('cancelEditEvent').addEventListener('click', () => $('eventDetailsDialog').close())

const eventLocationInput = $('eventLocation')
const locationResults = $('locationResults')
const locationSearchStatus = $('locationSearchStatus')
const searchControllers = new Map()
const searchTimers = new Map()
const activeResultIndexes = new Map()
const selectedLocations = new Map()

function formatPlace(feature) {
  const properties = feature.properties
  const name = properties.name || properties.street || properties.city || properties.country || 'Unnamed place'
  const details = [
    properties.street && properties.street !== name
      ? [properties.housenumber, properties.street].filter(Boolean).join(' ')
      : null,
    properties.district,
    properties.city,
    properties.state,
    properties.country
  ].filter((value, index, values) => value && values.indexOf(value) === index)

  return { name, details, label: [name, ...details].join(', ') }
}

function resetEventLocationSearches() {
  for (const [inputId, resultsId, statusId] of [
    ['eventLocation', 'locationResults', 'locationSearchStatus'],
    ['departureAirport', 'departureAirportResults', 'departureAirportStatus'],
    ['arrivalAirport', 'arrivalAirportResults', 'arrivalAirportStatus']
  ]) {
    searchControllers.get(inputId)?.abort()
    clearTimeout(searchTimers.get(inputId))
    $(inputId).value = ''
    $(resultsId).replaceChildren()
    $(resultsId).hidden = true
    $(statusId).textContent = ''
    selectedLocations.delete(inputId)
    activeResultIndexes.set(inputId, -1)
  }
}

function selectSearchResult(input, results, status, result) {
  if (!result) return

  input.value = result.dataset.label
  selectedLocations.set(input.id, JSON.parse(result.dataset.feature))
  results.hidden = true
  status.textContent = ''
  activeResultIndexes.set(input.id, -1)
}

function renderSearchResults(input, results, status, features) {
  results.replaceChildren()
  activeResultIndexes.set(input.id, -1)

  for (const feature of features) {
    const place = formatPlace(feature)
    const result = document.createElement('button')
    result.type = 'button'
    result.className = 'locationResult'
    result.setAttribute('role', 'option')
    result.dataset.label = place.label
    result.dataset.feature = JSON.stringify(feature)

    const heading = document.createElement('h3')
    heading.textContent = place.name
    const details = document.createElement('p')
    details.textContent = place.details.join(', ')
    result.append(heading, details)
    result.addEventListener('click', () => selectSearchResult(input, results, status, result))
    results.append(result)
  }

  results.hidden = features.length === 0
}

function setupPlaceSearch(input, results, status, airportOnly = false) {
  input.addEventListener('input', () => {
    const query = input.value.trim()
    searchControllers.get(input.id)?.abort()
    clearTimeout(searchTimers.get(input.id))
    results.replaceChildren()
    results.hidden = true
    status.textContent = ''
    selectedLocations.delete(input.id)
    activeResultIndexes.set(input.id, -1)

    if (query.length < 2) return

    status.textContent = airportOnly ? 'Searching airports…' : 'Searching…'
    searchTimers.set(input.id, setTimeout(async () => {
      const controller = new AbortController()
      searchControllers.set(input.id, controller)
      const params = new URLSearchParams({ q: query, limit: '3' })
      if (airportOnly) params.set('osm_tag', 'aeroway:aerodrome')

      try {
        const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
          signal: controller.signal
        })
        if (!response.ok) throw new Error(`Search failed (${response.status})`)

        const data = await response.json()
        if (input.value.trim() !== query) return

        renderSearchResults(input, results, status, data.features)
        status.textContent = data.features.length
          ? ''
          : airportOnly ? 'No airports found.' : 'No locations found.'
      } catch (error) {
        if (error.name === 'AbortError') return

        console.error(`Could not search ${airportOnly ? 'airports' : 'locations'}:`, error)
        status.textContent = `Could not search ${airportOnly ? 'airports' : 'locations'}. Please try again.`
      }
    }, 250))
  })

  input.addEventListener('keydown', event => {
    const options = [...results.querySelectorAll('.locationResult')]
    if (results.hidden || !options.length) return

    let activeIndex = activeResultIndexes.get(input.id) ?? -1
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeIndex = (activeIndex + 1) % options.length
      activeResultIndexes.set(input.id, activeIndex)
      options.forEach((option, index) => {
        option.classList.toggle('is-active', index === activeIndex)
        option.setAttribute('aria-selected', String(index === activeIndex))
      })
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeIndex = activeIndex < 0 ? options.length - 1 : (activeIndex - 1 + options.length) % options.length
      activeResultIndexes.set(input.id, activeIndex)
      options.forEach((option, index) => {
        option.classList.toggle('is-active', index === activeIndex)
        option.setAttribute('aria-selected', String(index === activeIndex))
      })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      selectSearchResult(input, results, status, options[activeIndex < 0 ? 0 : activeIndex])
    } else if (event.key === 'Escape') {
      results.hidden = true
    }
  })
}

setupPlaceSearch(eventLocationInput, locationResults, locationSearchStatus)
setupPlaceSearch($('departureAirport'), $('departureAirportResults'), $('departureAirportStatus'), true)
setupPlaceSearch($('arrivalAirport'), $('arrivalAirportResults'), $('arrivalAirportStatus'), true)

$('newEventForm').addEventListener('submit', async event => {
  event.preventDefault()

  if (!tripId || !currentTrip) {
    $('newEventMessage').textContent = 'Select a trip before creating an event.'
    return
  }

  const isFlight = $('eventType').value === 'flight'
  const eventTime = $('eventDateTime').value
  const departure = selectedLocations.get('departureAirport')
  const arrival = selectedLocations.get('arrivalAirport')
  const place = selectedLocations.get('eventLocation')
  if (!eventTime || (isFlight && (!departure || !arrival)) || (!isFlight && !place)) {
    $('newEventMessage').textContent = isFlight
      ? 'Choose both a departure and arrival airport, then enter the departure time.'
      : 'Choose a location and enter the event time.'
    return
  }

  const start = new Date(eventTime)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const eventDate = eventTime.slice(0, 10)
  if (eventDate < currentTrip.start_date || eventDate > currentTrip.end_date) {
    $('newEventMessage').textContent = 'The event date must be within the trip dates.'
    return
  }

  const departurePlace = isFlight ? formatPlace(departure) : null
  const arrivalPlace = isFlight ? formatPlace(arrival) : null
  const selectedPlace = isFlight ? null : formatPlace(place)
  const title = isFlight
    ? `Flight: ${departurePlace.name} to ${arrivalPlace.name}`
    : selectedPlace.name
  const notes = isFlight
    ? `Departure airport: ${departurePlace.label} (${departure.geometry.coordinates[1]}, ${departure.geometry.coordinates[0]})\nArrival airport: ${arrivalPlace.label} (${arrival.geometry.coordinates[1]}, ${arrival.geometry.coordinates[0]})`
    : `${selectedPlace.label} (${place.geometry.coordinates[1]}, ${place.geometry.coordinates[0]})`
  const submitButton = event.currentTarget.querySelector('button[type="submit"]')
  submitButton.disabled = true
  $('newEventMessage').textContent = ''

  try {
    const { data, error } = await supabase
      .from('trip_events')
      .insert({
        trip_id: tripId,
        title,
        notes,
        starts_at: start.toISOString(),
        ends_at: end.toISOString()
      })
      .select('id, title, notes, starts_at, ends_at')
      .single()

    if (error) throw error

    calendar?.addEvent({
      id: data.id,
      title: data.title,
      start: data.starts_at,
      end: data.ends_at,
      extendedProps: {
        notes: data.notes,
        location: getEventLocation(data.notes, data.title)
      }
    })
    $('newEventDialog').close()
  } catch (error) {
    console.error('Could not create event:', error)
    $('newEventMessage').textContent = `Could not create event: ${error.message}`
  } finally {
    submitButton.disabled = false
  }
})

$('cancelNewEvent').addEventListener('click', () => $('newEventDialog').close())










const calendarEl = $('calendar')
calendar = new FullCalendar.Calendar(calendarEl, {
  initialView: 'timeGridDay',
  height: window.matchMedia('(max-width: 768px)').matches ? '90vh' : 'auto',
  eventClick(info) {
    openEventEditor(info.event)
  },
  eventContent(arg) {
    const content = document.createElement('div')
    content.className = 'calendarEventContent'

    if (arg.timeText) {
      const time = document.createElement('span')
      time.className = 'calendarEventTime'
      time.textContent = arg.timeText
      content.append(time)
    }

    const title = document.createElement('span')
    title.className = 'calendarEventTitle'
    title.textContent = arg.event.title
    content.append(title)

    const location = arg.event.extendedProps.location
    if (location) {
      const subtitle = document.createElement('span')
      subtitle.className = 'calendarEventLocation'
      subtitle.textContent = location
      content.append(subtitle)
    }

    return { domNodes: [content] }
  }
})
calendar.render()

loadTripTitle()
