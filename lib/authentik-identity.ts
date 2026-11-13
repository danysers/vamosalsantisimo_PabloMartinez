export type IdentityBinding = { sub: string; username: string; role: 'configuration' | 'sponsor' }

export function resolveAuthentikIdentity(profile: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env) {
  const bindings: IdentityBinding[] = JSON.parse(env.AUTHENTIK_IDENTITIES || '[]')
  if (!Array.isArray(bindings) || bindings.length !== 3 ||
      bindings.some(b => !/^[a-f0-9]{64}$/.test(b.sub) || !/^[a-z0-9_]{3,30}$/.test(b.username) || !['configuration', 'sponsor'].includes(b.role)) ||
      new Set(bindings.map(b => b.sub)).size !== bindings.length || new Set(bindings.map(b => b.username)).size !== bindings.length ||
      bindings.filter(b => b.role === 'configuration').length !== 1) throw new Error('Invalid identity bindings')
  if (profile.iss !== 'https://aute.codss.com.ar/application/o/vamosalsantisimo-panel/' ||
      profile.aud !== env.AUTHENTIK_CLIENT_ID || typeof profile.sub !== 'string') throw new Error('Invalid identity issuer or audience')
  const binding = bindings.find(b => b.sub === profile.sub)
  if (!binding || typeof profile.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) throw new Error('Identity not authorized')
  if (binding.role === 'sponsor' && (!Array.isArray(profile.groups) || !profile.groups.includes('vamosalsantisimo-sponsor'))) throw new Error('Sponsor membership required')
  return { ...binding, email: profile.email.toLowerCase(), name: typeof profile.name === 'string' ? profile.name.slice(0,150) : binding.username }
}
