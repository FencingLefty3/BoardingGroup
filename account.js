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