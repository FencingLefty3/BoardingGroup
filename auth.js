import { supabase } from './supabase.js'
import { redirectIfSignedIn } from './guard.js'

redirectIfSignedIn()

const $ = id => document.getElementById(id)

function showForm(which) {
    $('login').style.display = which == 'login' ? 'flex' : 'none'
    $('signup').style.display = which == 'signup' ? 'flex' : 'none'
}

$('toSignUp').addEventListener('click', () => showForm('signup'))
$('toLogin').addEventListener('click', () => showForm('login'))

$('login').addEventListener('submit', async e => {
    e.preventDefault()
    const msg = $('loginMsg')
    msg.textContent = ''

    const { error } = await supabase.auth.signInWithPassword({
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value
    })
    if (error) msg.textContent = error.message
    else location.replace('account.html')


})

 $('signup').addEventListener('submit', async e => {
    e.preventDefault()
    const msg = $('signUpMsg')
    msg.textContent = ''

    const { data, error } = await supabase.auth.signUp({
        email: $('SignUpEmail').value.trim(),
        password: $('SignUpPassword').value,
        options: {
            data: { username: $('SignUpUsername').value.trim() },
            emailRedirectTo: new URL('account.html', location.href).href

        }
    })
    if (error) return (msg.textContent = error.message)
    if (data.session) location.replace('account.html')
    
    else msg.textContent = 'Check Inbox for Email confirmation.'


})