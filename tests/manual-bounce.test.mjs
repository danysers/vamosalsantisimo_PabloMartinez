import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { processRequestedBounceSync, listenForBounceRequests } from '../scripts/email-bounce-worker.mjs'

test('idle startup and ordinary database notifications never connect to IMAP; one explicit request performs one scan',async()=>{
  const db=new EventEmitter(),requestId=randomUUID()
  let queued=false,connects=0,checks=0,completed=0
  db.query=async(query,args)=>{
    if(query.startsWith('UPDATE email_bounce_sync SET request_status=\'running\'')){
      checks++;if(!queued)return {rows:[]};queued=false;return {rows:[{request_id:requestId}]}
    }
    if(query.startsWith('SELECT pg_try_advisory_lock'))return {rows:[{locked:true}]}
    if(query.startsWith('SELECT cursors'))return {rows:[{cursors:{}}]}
    if(query.startsWith('UPDATE email_bounce_sync SET request_status=$2')){completed++;assert.equal(args[1],'succeeded')}
    return {rows:[]}
  }
  const makeClient=()=>({connect:async()=>{connects++},list:async()=>[{path:'INBOX',flags:new Set()}],mailbox:{uidValidity:'1'},getMailboxLock:async()=>({release(){}}),search:async()=>[],logout:async()=>{},close(){}})
  assert.deepEqual(await processRequestedBounceSync(db,makeClient),{idle:true});assert.equal(connects,0)
  const listener=listenForBounceRequests(db,makeClient)
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(checks,2);assert.equal(connects,0)
  db.emit('notification',{channel:'unrelated'})
  await new Promise(resolve=>setImmediate(resolve));assert.equal(checks,2)
  queued=true;db.emit('notification',{channel:'vas_email_bounce_requested',payload:requestId})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(connects,1);assert.equal(completed,1)
  // A duplicate notification may check the persisted queue, but never rescans.
  db.emit('notification',{channel:'vas_email_bounce_requested',payload:requestId})
  await new Promise(resolve=>setImmediate(resolve));assert.equal(connects,1)
  db.emit('end');await listener
})
