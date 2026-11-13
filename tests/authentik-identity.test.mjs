import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAuthentikIdentity } from '../lib/authentik-identity.ts'
const bindings = [{sub:'a'.repeat(64),username:'owner',role:'configuration'},
  {sub:'b'.repeat(64),username:'sponsor_one',role:'sponsor'}, {sub:'c'.repeat(64),username:'sponsor_two',role:'sponsor'}]
const env = { AUTHENTIK_CLIENT_ID:'client-test', AUTHENTIK_IDENTITIES:JSON.stringify(bindings) }
const profile = { iss:'https://aute.codss.com.ar/application/o/vamosalsantisimo-panel/', aud:'client-test',
  sub:'b'.repeat(64), email:'sponsor@example.invalid',groups:['vamosalsantisimo-sponsor'] }
test('roles use immutable subject, never editable username, email or admin claims', () => {
  assert.equal(resolveAuthentikIdentity({...profile, preferred_username:'owner',role:'configuration',groups:['vamosalsantisimo-sponsor','authentik Admins']},env).role,'sponsor')
  assert.equal(resolveAuthentikIdentity({...profile,sub:'a'.repeat(64)},env).role,'configuration')
})
test('unknown identities, wrong issuer/audience and removed sponsor membership fail closed', () => {
  for (const change of [{sub:'d'.repeat(64)}, {iss:'https://evil.invalid/'}, {aud:'other'}, {groups:[]}, {email:''}]) {
    assert.throws(()=>resolveAuthentikIdentity({...profile,...change},env))
  }
  assert.throws(()=>resolveAuthentikIdentity(profile,{}))
  assert.throws(()=>resolveAuthentikIdentity(profile,{...env,AUTHENTIK_IDENTITIES:JSON.stringify([bindings[0],bindings[0],bindings[2]])}))
})
