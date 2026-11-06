import { supabase } from './supabase.js'
import { requireAuth } from './guard.js'

const $ = id => document.getElementById(id)
const suggestionColors = ['#f4c7c3', '#f7df9b', '#c8e3c2', '#c5d9f2', '#e0cef2', '#f4d2a8']

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

$('createSuggestionForm').addEventListener('submit', e => {
  e.preventDefault()

  const title = $('NewSuggestionTitle').value.trim()
  const comment = $('commentInput').value.trim()
  if (!title) return

  const card = document.createElement('article')
  card.className = 'suggestionCard'
  card.style.backgroundColor = suggestionColors[Math.floor(Math.random() * suggestionColors.length)]

  const heading = document.createElement('h3')
  heading.textContent = title
  card.append(heading)

  if (comment) {
    const description = document.createElement('p')
    description.textContent = comment
    card.append(description)
  }

  $('suggestionBoard').append(card)
  $('createSuggestionForm').reset()
  $('SuggestionDialog').close()
})

const tripId = new URLSearchParams(window.location.search).get('id')
let currentTrip = null
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
  } catch (error) {
    console.error('Could not load trip title:', error)
    $('editButton').hidden = true
  }
}

document.addEventListener("DOMContentLoaded", function () {
        const calendarEl = document.getElementById("calendar");
        const calendar = new FullCalendar.Calendar(calendarEl, {
          initialView: "timeGridDay",
          height: window.matchMedia("(max-width: 768px)").matches ? "90vh" : "auto",
          
        });
        calendar.render();
        calendar.addEvent({
            title: 'My Event',
            start: '2026-11-5T10:00:00',
            end: '2026-11-5T12:00:00',
            allDay: false
        });
      });

loadTripTitle()
