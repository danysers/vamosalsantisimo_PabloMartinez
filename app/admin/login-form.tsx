'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function SignOut() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function signOut() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: '{}' })
      if (!response.ok) {
        setError('No se confirmó el cierre de sesión. Podría seguir activa: reintentá o eliminá los datos de este sitio antes de dejar el equipo.')
        return
      }
      router.replace('/admin')
      router.refresh()
    } catch {
      setError('No se confirmó el cierre de sesión. Podría seguir activa: reintentá o eliminá los datos de este sitio antes de dejar el equipo.')
    } finally {
      setBusy(false)
    }
  }
  return <div className="admin-sign-out"><button className="button button-outline" type="button" disabled={busy} onClick={signOut}>{busy ? 'Cerrando…' : 'Cerrar sesión'}</button><p role="alert" aria-live="assertive">{error}</p></div>
}

export default function AdminLogin() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
      <label htmlFor="admin-username">Usuario</label>
      <input id="admin-username" name="username" type="text" autoComplete="username" required maxLength={30} />
      <label htmlFor="admin-password">Contraseña</label>
      <input id="admin-password" name="password" type="password" autoComplete="current-password" required />
      <button className="button button-gold" disabled={busy} type="submit">{busy ? 'Ingresando…' : 'Ingresar'}</button>
      <p role="alert" aria-live="polite">{error}</p>
    </form>
  )
}
