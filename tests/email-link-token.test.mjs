import test from 'node:test'
import assert from 'node:assert/strict'
import { emailLinkToken, hasEmailLink, workshopEmailUrl } from '../lib/email-link-token.ts'
import { checkoutAccessToken, hasCheckoutAccess, hasCheckoutReturn } from '../lib/checkout-access.ts'
import { registrationEmail, accreditationEmail } from '../lib/email-templates.ts'

const identity={id:'00000000-0000-4000-8000-000000000001',reference:'TestReference123',creationKey:'independent-registration-key',email:'person@example.invalid'}
test('email capabilities bind purpose, identity, recipient state and credential, expire and cannot authorize checkout',()=>{
  process.env.WORKSHOP_CHECKOUT_TOKEN_KEY='email-link-unit-key-'.repeat(3)
  const now=Date.parse('2026-10-30T12:00:00Z'),ends=new Date(now+86_400_000)
  const proof=emailLinkToken('proof',identity,ends,now)
  assert.equal(hasEmailLink(proof,'proof',identity,now),true)
  for(const change of [{id:'other'},{reference:'OtherReference'},{creationKey:'other'},{email:'changed@example.invalid'},{credentialId:'other'}])
    assert.equal(hasEmailLink(proof,'proof',{...identity,...change},now),false)
  assert.equal(hasEmailLink(proof,'pass',identity,now),false)
  assert.equal(hasEmailLink(proof,'proof',identity,now+86_400_000),false)
  assert.equal(hasEmailLink(proof+'x','proof',identity,now),false)
  assert.equal(hasCheckoutAccess(proof,identity.id,identity.creationKey),false)
  assert.equal(hasCheckoutReturn(proof,identity.reference,identity.id,identity.creationKey,now),false)
  assert.equal(hasEmailLink(checkoutAccessToken(identity.id,identity.creationKey),'proof',identity,now),false)
  const pass=emailLinkToken('pass',{...identity,credentialId:'credential-v1'},ends,now)
  assert.equal(hasEmailLink(pass,'pass',{...identity,credentialId:'credential-v2'},now),false)
})
test('email actions use the principal origin, fragment capabilities and clickable escaped buttons',()=>{
  process.env.WORKSHOP_CHECKOUT_TOKEN_KEY='email-link-unit-key-'.repeat(3)
  process.env.SITE_ORIGIN='https://vamosalsantisimo.com'
  const proof=workshopEmailUrl('proof',identity,new Date(Date.now()+86_400_000))
  const url=new URL(proof)
  assert.equal(url.origin,'https://vamosalsantisimo.com')
  assert.equal(url.pathname,'/formacion/comprobante')
  assert.deepEqual([...url.searchParams.keys()],['reference'])
  assert.match(url.hash,/#proof=v1\./)
  const email=registrationEmail({firstName:'Persona <prueba>',reference:identity.reference,choice:'bank_transfer',proofUrl:proof})
  assert.match(email.text,/sin volver a cargar tus datos/)
  assert.match(email.html,/>Subir mi comprobante<\/a>/)
  assert.match(email.html,/Persona &lt;prueba&gt;/)
  assert.doesNotMatch(email.text,/con tu DNI/)
  const pass=workshopEmailUrl('pass',{...identity,credentialId:'credential-v1'},new Date(Date.now()+86_400_000))
  const confirmation=accreditationEmail({firstName:'Persona',reference:identity.reference,passUrl:pass})
  assert.match(confirmation.html,/cid:acreditacion/)
  assert.match(confirmation.html,/>Ver mi volante e imprimir<\/a>/)
  assert.match(confirmation.text,/formacion\/acreditacion/)
  assert.throws(()=>accreditationEmail({firstName:'X',reference:'Test',passUrl:'javascript:alert(1)'}))
  for(const origin of ['https://evil.invalid/path','https://user:pass@evil.invalid','http://evil.invalid']) {
    process.env.SITE_ORIGIN=origin
    assert.throws(()=>workshopEmailUrl('proof',identity,new Date(Date.now()+86_400_000)))
  }
})
