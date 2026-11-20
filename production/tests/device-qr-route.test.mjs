import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {createHash} from 'node:crypto';
const transpile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const toUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const {devicePermit}=await import(toUrl(transpile('lib/device-permit.ts')));
let state;
const hash=s=>createHash('sha256').update(s).digest('hex');
class ApiError extends Error{constructor(msg,status=400){super(msg);this.status=status}}
const db={from(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},async maybeSingle(){
 const rows=state[table]||[];return{data:rows.find(r=>filters.every(([k,v])=>r[k]===v))||null,error:null};
},single(){return q.maybeSingle()}};return q}};
const stub={z,devicePermit,adminDb:()=>db,hash,ApiError,body:r=>r.json(),checked:r=>{if(r.error)throw r.error;return r.data},secretEqual:(a,b)=>a===b,
 limit:()=>{},ok:data=>Response.json(data),failure:e=>Response.json({error:e.message},{status:e.status||400}),
 useCloudCameraPreview:()=>false,previewWanted:()=>false,cloudPreviewWanted:async()=>false,
 issueQr:async()=>({url:'https://example.test/?qr='+state.qrToken,expires_at:new Date(Date.now()+60000).toISOString(),device_id:'R1_001'}),
 QRCode:{toDataURL:async()=>'data:image/png;base64,TEST'},
};
globalThis.__gatepassQrRouteTest=stub;
const src=transpile('app/api/device/[action]/route.ts').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'');
const {POST}=await import(toUrl('const {'+Object.keys(stub).join(',')+'}=globalThis.__gatepassQrRouteTest;\n'+src));
function reset(){state={qrToken:'b'.repeat(64),gp_device_secrets:[{device_id:'R1_001',token_hash:hash('a'.repeat(64))}],gp_devices:[{id:'R1_001',revoked:false,firmware:'gatepass-r1-1.0.0'}],gp_qr_sessions:[{device_id:'R1_001',token_hash:hash('b'.repeat(64)),request_id:'req',expires_at:new Date(Date.now()+60000).toISOString(),consumed_at:null}],gp_events:[]};}
async function call(action='qr-status',body={token:state.qrToken},credential='a'.repeat(64)){
 const r=await POST(new Request('https://example.test/api/device/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Device-ID':'R1_001',Authorization:'Bearer '+credential},body:JSON.stringify(body)}),{params:Promise.resolve({action:action.split('?')[0]})});return{code:r.status,body:await r.json()};
}
test('Device authentication, revocation, ownership, expiry and pending decisions',async()=>{
 reset();assert.equal((await call('qr-status',undefined,'wrong')).code,401);
 state.gp_devices[0].revoked=true;assert.equal((await call()).code,403);reset();
 state.gp_qr_sessions[0].device_id='OTHER_DEVICE';assert.equal((await call()).code,404);reset();
 state.gp_qr_sessions[0].expires_at=new Date(Date.now()-1).toISOString();assert.equal((await call()).code,410);reset();
 assert.deepEqual((await call()).body,{status:'pending',allowed:false,actuation_enabled:false});
 state.gp_qr_sessions[0].consumed_at=new Date().toISOString();assert.equal((await call()).body.status,'pending');
});
test('QR result uses matching event and original decision time, no employee or token disclosure',async()=>{
 reset();process.env.GATEPASS_R1_ACTUATION_ENABLED='true';state.gp_qr_sessions[0].consumed_at=new Date().toISOString();
 state.gp_events=[{device_id:'R1_001',method:'qr',request_id:'req',status:'allowed',created_at:new Date(Date.now()-1000).toISOString()}];
 let r=await call();assert.equal(r.body.actuation_enabled,true);assert.equal(r.body.unlock_ms,3000);assert.equal(r.body.employee_id,undefined);assert.equal(r.body.token,undefined);
 state.gp_events[0].created_at=new Date(Date.now()-20000).toISOString();r=await call();assert.equal(r.body.allowed,true);assert.equal(r.body.actuation_enabled,false);
 state.gp_events[0].created_at=new Date().toISOString();state.gp_events[0].device_id='OTHER_DEVICE';assert.equal((await call()).body.status,'pending');
 delete process.env.GATEPASS_R1_ACTUATION_ENABLED;
});
test('R1 can request compact QR text; old clients retain image and face stays disabled',async()=>{
 reset();let r=await call('qr-session?format=text',{});assert.equal(r.body.image,undefined);assert.equal(r.body.url,'https://example.test/?qr='+state.qrToken);
 r=await call('qr-session',{});assert.match(r.body.image,/^data:image/);assert.equal((await call('face',{})).code,410);
});
