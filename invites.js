import { supabase } from './supabase.js'

// join.js saves the invite token before sending someone to log in or sign up.
// Call this once they are signed in. It asks the database to add them to the trip.
export async function claimPendingInvite() {
  const token = localStorage.getItem('pendingInvite')
  if (!token) return null
  localStorage.removeItem('pendingInvite')

  const { data: tripId, error } = await supabase.rpc('accept_invite', { p_token: token })
  return error ? { error } : { tripId }
}