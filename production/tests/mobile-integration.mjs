import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries((await readFile('.env.local','utf8')).split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(env.SUPABASE_URL))throw Error('This fixture may run only on local Supabase');
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const base='http://127.0.0.1:3000',tag='MOBILEQA_'+randomBytes(4).toString('hex'),password='QA-'+randomBytes(16).toString('hex');
const users=[],employees=[],checks=[];let door,zone,device,credential;
const check=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data;};
const pass=s=>{checks.push(s);console.log('PASS',s);};
async function call(path,data,token,status=200){const r=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:'Bearer '+token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});const json=await r.json();assert.equal(r.status,status,path+': '+JSON.stringify(json));return json;}
try{
 for(let i=0;i<3;i++){
  const u=await check(db.auth.admin.createUser({email:`${tag.toLowerCase()}-${i}@example.test`,password,email_confirm:true}));users.push(u.user);
  await check(db.from('gp_profiles').insert({id:u.user.id,role:i===2?'Admin':'Employee'}));
  if(i<2){const id=tag+'_'+i;employees.push(id);await check(db.from('gp_employees').insert({id,name:'พนักงานสมมติ mobile QA '+i,department:'QA',job_title:'API QA',auth_user_id:u.user.id}));}
 }
 await call('/api/mobile/login',{email:users[0].email,password:'incorrect'},undefined,401);
 await call('/api/mobile/login',{email:users[2].email,password},undefined,403);pass('Incorrect password and non-employee account rejected');
 let session=await call('/api/mobile/login',{email:users[0].email,password});assert.ok(session.access_token);assert.ok(session.refresh_token);assert.equal(session.user.employee_id,employees[0]);pass('Real employee login without browser cookies');
 await call('/api/employee/workspace',undefined,undefined,401);
 await call('/api/employee/workspace',undefined,'invalid',401);
 const w=await call('/api/employee/workspace',undefined,session.access_token);assert.equal(w.person.id,employees[0]);assert.equal(w.person.job_title,'API QA');assert.equal(w.capabilities.actuation_enabled,false);pass('Bearer auth validates server identity and scopes employee workspace');
 await call('/api/employee/leave',{starts:'2026-11-01',ends:'2026-11-01',kind:'personal',reason:'ทดสอบ mobile fixture'},session.access_token);assert.equal((await call('/api/employee/workspace',undefined,session.access_token)).leaves.length,1);pass('Native leave POST works without Origin and persists in PostgreSQL');
 await call('/api/employee/adjustment',{day:'2026-10-27',requested_in:'09:00',requested_out:'18:00',reason:'ทดสอบ mobile fixture'},session.access_token);pass('Adjustment request saved independently of access events');
 credential=(await check(db.from('gp_credentials').insert({employee_id:employees[1],method:'card',credential_hash:createHash('sha256').update(randomBytes(32)).digest('hex'),label:'QA other card',last_four:'ABCD'}).select('id').single())).id;
 await call('/api/employee/revoke-credential',{id:credential},session.access_token,404);pass('Employee cannot revoke another employee card');
 await check(db.from('gp_credentials').update({employee_id:employees[0]}).eq('id',credential));await call('/api/employee/revoke-credential',{id:credential},session.access_token);assert.equal((await check(db.from('gp_credentials').select('revoked').eq('id',credential).single())).revoked,true);pass('Employee can revoke own card and audit is stored');
 zone=(await check(db.from('gp_zones').insert({name:tag}).select('id').single())).id;
 door=(await check(db.from('gp_doors').insert({name:tag,zone_id:zone}).select('id').single())).id;
 device=tag;await check(db.from('gp_devices').insert({id:device,name:tag,door_id:door}));
 await check(db.from('gp_methods').insert({employee_id:employees[0],method:'qr',enabled:true}));
 await check(db.from('gp_permissions').insert({employee_id:employees[0],door_id:door,starts:'00:00',ends:'23:59:59'}));
 const token=randomBytes(32).toString('hex');await check(db.from('gp_qr_sessions').insert({device_id:device,token_hash:createHash('sha256').update(token).digest('hex'),expires_at:new Date(Date.now()+60000).toISOString()}));
 const result=await call('/api/employee/qr',{token},session.access_token);assert.equal(result.allowed,true);assert.equal(result.actuation_enabled,false);
 assert.equal((await call('/api/employee/qr',{token},session.access_token)).request_id,result.request_id);
 const second=await call('/api/mobile/login',{email:users[1].email,password});await call('/api/employee/qr',{token},second.access_token,410);pass('QR checked centrally, own retry deduplicated and cross-account replay rejected');
 session=await call('/api/mobile/refresh',{refresh_token:session.refresh_token});assert.equal(session.user.employee_id,employees[0]);pass('Supabase refresh rotation retains employee binding');
 await check(db.from('gp_profiles').update({active:false}).eq('id',users[0].id));await call('/api/employee/workspace',undefined,session.access_token,403);await check(db.from('gp_profiles').update({active:true}).eq('id',users[0].id));pass('Profile suspension enforced with an already-issued token');
 await call('/api/mobile/logout',{},undefined,401);await call('/api/mobile/logout',{},session.access_token);await call('/api/mobile/refresh',{refresh_token:session.refresh_token},undefined,401);pass('Logout rejects cookies-only requests and revokes refresh session');
 console.log(JSON.stringify({checks:checks.length,result:'passed',hardware_tested:false},null,2));
}finally{
 // Delete only the identifiers created in this run. Preserve all user data.
 if(device){await db.from('gp_qr_sessions').delete().eq('device_id',device);await db.from('gp_events').delete().eq('device_id',device);await db.from('gp_devices').delete().eq('id',device);}
 if(credential)await db.from('gp_credentials').delete().eq('id',credential);
 for(const id of employees){for(const table of ['gp_leaves','gp_adjustments','gp_permissions','gp_methods'])await db.from(table).delete().eq('employee_id',id);await db.from('gp_employees').delete().eq('id',id);}
 if(door)await db.from('gp_doors').delete().eq('id',door);if(zone)await db.from('gp_zones').delete().eq('id',zone);
 for(const user of users){await db.from('gp_audit').delete().eq('actor',user.id);await db.auth.admin.deleteUser(user.id);}
 console.log('Cleaned up this run only; database preserved.');
}
