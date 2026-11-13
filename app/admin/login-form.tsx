'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createAuthClient } from 'better-auth/react'

const authClient = createAuthClient()

export function SignOut() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function signOut() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await authClient.signOut({ callbackURL: '/admin' })
      if (result.error) throw new Error('Sign-out failed')
    } catch {
      setError('No se confirmó el cierre de sesión de Authentik. Reintentá y verificá que aparezca su pantalla de acceso.')
    } finally {
      setBusy(false)
    }
  }
  return <div className="admin-sign-out"><button className="button button-outline" type="button" disabled={busy} onClick={signOut}>{busy ? 'Cerrando…' : 'Cerrar sesión'}</button><p role="alert" aria-live="assertive">{error}</p></div>
}

export default function AdminLogin({ authentikEnabled = false, authentikOnly = false, initialError }: { authentikEnabled?: boolean; authentikOnly?: boolean; initialError?: string }) {
  const router = useRouter()
  const [error, setError] = useState(initialError ?? '')
  const [busy, setBusy] = useState(false)

  async function signInAuthentik() {
    if (busy) return
    setBusy(true)
    setError('')
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
