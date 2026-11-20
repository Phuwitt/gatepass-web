import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
const code=ts.transpileModule(fs.readFileSync('lib/device-permit.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {devicePermit}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const now=Date.parse('2026-11-19T12:00:00Z');
const ev={request_id:'id',status:'allowed',created_at:new Date(now-1000).toISOString()};
test('Only enabled R1 with a fresh persisted allow receives a bounded pulse',()=>{
 const p=devicePermit(ev,'gatepass-r1-1.0.0',true,now);
 assert.equal(p.actuation_enabled,true);assert.equal(p.unlock_ms,3000);
 assert.equal(Date.parse(p.decision_expires_at),now+9000);
 for(const [e,f,on] of [[ev,'gatepass-r1-1.0.0',false],[ev,'gatepass-device-0.7.0',true],[{...ev,status:'denied'},'gatepass-r1-1.0.0',true],[ev,null,true]]){
  const r=devicePermit(e,f,on,now);assert.equal(r.actuation_enabled,false);assert.equal(r.unlock_ms,0);
 }
});
test('An old retry cannot refresh a permit; malformed and future timestamps deny actuation',()=>{
 for(const created_at of [new Date(now-10000).toISOString(),new Date(now-30000).toISOString(),new Date(now+1).toISOString(),'bad']){
  const r=devicePermit({...ev,created_at},'gatepass-r1-1.0.0',true,now);assert.equal(r.actuation_enabled,false);assert.equal(r.unlock_ms,0);
 }
});
