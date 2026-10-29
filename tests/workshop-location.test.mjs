import test from 'node:test'
import assert from 'node:assert/strict'
import { individualRegistrationSchema } from '../lib/workshop-input.ts'
import { argentinaProvinces } from '../lib/workshop-location.ts'
import { recoveryCodeHash, encryptRecoveryCode, decryptRecoveryCode, matchesRecoveryCode } from '../lib/recovery-code.ts'

test('individual enrollment requires DNI and province, preserves optional nickname and accepts foreign localities',()=>{
  const person={firstName:'Ana',lastName:'Prueba',documentNumber:'12345678',birthDate:'1990-04-15',phone:'3704123456',email:'ana@example.invalid',ecclesialState:'laico',paymentDifficulty:false,paymentMethod:'on_site',country:'Argentina',province:'Formosa'}
  assert.equal(argentinaProvinces.length,24)
  assert.equal(individualRegistrationSchema.safeParse(person).success,true)
  assert.equal(individualRegistrationSchema.safeParse({...person,documentNumber:''}).success,false)
  assert.equal(individualRegistrationSchema.safeParse({...person,province:'Curitiba'}).success,false)
  assert.equal(individualRegistrationSchema.safeParse({...person,country:'Brasil',province:'Paraná',locality:'Curitiba'}).success,true)
  assert.equal(individualRegistrationSchema.safeParse({...person,country:'Brasil',province:'Paraná'}).success,false)
})

test('recovery code encryption is challenge-bound and hashes never authorize another code',()=>{
  process.env.WORKSHOP_CHECKOUT_TOKEN_KEY='recovery-unit-test-secret-'.repeat(3)
  const id='one',code='123456',encrypted=encryptRecoveryCode(id,code)
  assert.ok(!encrypted.includes(code))
  assert.equal(decryptRecoveryCode(id,encrypted),code)
  assert.throws(()=>decryptRecoveryCode('another',encrypted))
  assert.equal(matchesRecoveryCode(id,code,recoveryCodeHash(id,code)),true)
  assert.equal(matchesRecoveryCode(id,'999999',recoveryCodeHash(id,code)),false)
})

test('assistance requires a nonblank reason while paying enrollments do not',()=>{
  const person={firstName:'Ana',lastName:'Prueba',documentNumber:'12345678',birthDate:'1990-04-15',phone:'3704123456',email:'ana@example.invalid',ecclesialState:'laico',paymentDifficulty:true,country:'Argentina',province:'Formosa'}
  for(const reason of [undefined,'','  \n  ']) assert.equal(individualRegistrationSchema.safeParse({...person,paymentDifficultyNotes:reason}).success,false)
  const accepted=individualRegistrationSchema.parse({...person,paymentDifficultyNotes:'  Necesito ayuda para cubrir el costo.  '})
  assert.equal(accepted.paymentDifficultyNotes,'Necesito ayuda para cubrir el costo.')
  assert.equal(individualRegistrationSchema.safeParse({...person,paymentDifficultyNotes:'x'.repeat(1001)}).success,false)
  assert.equal(individualRegistrationSchema.safeParse({...person,paymentDifficulty:false,paymentMethod:'on_site'}).success,true)
})
