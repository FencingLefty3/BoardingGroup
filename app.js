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