import { supabase } from './supabase.js'

// An invite link looks like join.html?invite=TOKEN.
// Save the token, then send the person to log in. account.js claims it once they are signed in.
const token = new URLSearchParams(location.search).get('invite')
if (token) localStorage.setItem('pendingInvite', token)

const { data: { session } } = await supabase.auth.getSession()
location.replace(session ? 'account.html' : 'auth.html')