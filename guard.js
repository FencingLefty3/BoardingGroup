import { supabase } from './supabase.js'

export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    location.replace('auth.html')
    return null          
  }
  return session
}

export async function redirectIfSignedIn() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) location.replace('account.html')
}