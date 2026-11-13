import {test} from 'node:test'
import assert from 'node:assert/strict'
import {selectExistingAdministrator} from '../lib/authentik-admin-link.ts'
const row={id:'original-audit-id',username:'legacy_admin',banned:false,disabled:false,role:'configuration',auth_role:'admin'}
test('explicit migration links the sole eligible existing administrator, preserving audit identity',()=>{
  assert.equal(selectExistingAdministrator([row],'danysers',true),row.id)
  assert.throws(()=>selectExistingAdministrator([row],'danysers',false))
  assert.equal(selectExistingAdministrator([row],'legacy_admin',false),row.id)
})
test('migration rejects ambiguous, banned, disabled, wrong-role and colliding-name candidates',()=>{
  for(const rows of [[],[row,{...row,id:'another',username:'second'}],[{...row,banned:true}],[{...row,disabled:true}],
    [{...row,role:'sponsor'}],[{...row,auth_role:'user'}],[row,{...row,id:'blocked',username:'danysers',banned:true}]]) {
    assert.throws(()=>selectExistingAdministrator(rows,'danysers',true))
  }
})
