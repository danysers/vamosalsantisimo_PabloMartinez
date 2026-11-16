'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function SignOut() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/authentik-logout', {
        method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error('Local sign-out failed')
      const result = await response.json() as { url?: unknown }
      if (typeof result.url !== 'string') throw new Error('Missing logout destination')
      const destination = new URL(result.url)
      if (destination.origin !== 'https://aute.codss.com.ar' ||
          destination.pathname !== '/if/flow/default-invalidation-flow/' ||
          destination.search || destination.hash || destination.username || destination.password) {
        throw new Error('Invalid logout destination')
      }
      // A fresh top-level GET sends the Authentik session cookie; a cross-site
      // redirect chained to the POST was returning silently to the panel.
      window.location.replace(destination.href)
    } catch {
      setError('No se pudo cerrar la sesión. Reintentá o avisá al administrador.')
      setBusy(false)
    }
  }

  return <form className="admin-sign-out" method="post" action="/api/auth/authentik-logout" onSubmit={signOut}>
    <button className="button button-outline" type="submit" disabled={busy}>{busy ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    {error && <span role="alert">{error}</span>}
  </form>
}

export default function AdminLogin({ authentikEnabled = false, authentikOnly = false, initialError }: { authentikEnabled?: boolean; authentikOnly?: boolean; initialError?: string }) {
  const router = useRouter()
  const [error, setError] = useState(initialError ?? '')
  const [busy, setBusy] = useState(false)

  async function signInAuthentik() {
    if (busy) return
    setBusy(true)
    setError('')
    if (authentikOnly) {
      // The server entry point also clears the short-lived signed-out marker.
      window.location.assign(new URL('/api/auth/authentik-start', window.location.href).href)
      return
    }
    try {
      const response = await fetch('/api/auth/sign-in/social', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'authentik', callbackURL: '/admin', errorCallbackURL: '/admin' }) })
      if (!response.ok) throw new Error('Sign-in unavailable')
      const data = await response.json()
      const destination = new URL(data.url)
      if (destination.origin !== 'https://aute.codss.com.ar' || destination.pathname !== '/application/o/authorize/') throw new Error('Invalid destination')
      window.location.assign(destination.href)
    } catch {
      setError('No pudimos iniciar Authentik. Intentá nuevamente o contactá al administrador.')
      setBusy(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const result = await fetch('/api/auth/sign-in/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      })
      if (!result.ok) {
        setError('No pudimos iniciar sesión. Revisá las credenciales o intentá más tarde.')
        return
      }
      router.replace('/admin')
      router.refresh()
    } catch {
      setError('La administración local no está disponible en este momento.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="admin-form">
      {authentikEnabled && <button className="button button-gold" type="button" disabled={busy} onClick={signInAuthentik}>Ingresar con Authentik</button>}
      {!authentikOnly && <><label htmlFor="admin-username">Usuario</label>
      <input id="admin-username" name="username" type="text" autoComplete="username" required maxLength={30} />
      <label htmlFor="admin-password">Contraseña</label>
      <input id="admin-password" name="password" type="password" autoComplete="current-password" required />
      <button className="button button-gold" disabled={busy} type="submit">{busy ? 'Ingresando…' : 'Ingresar'}</button></>}
      <p role="alert" aria-live="polite">{error}</p>
    </form>
  )
}
