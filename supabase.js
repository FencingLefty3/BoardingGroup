import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
})

await supabase.auth.signOut()

supabase.auth.onAuthStateChange((event, session) => {
    
})