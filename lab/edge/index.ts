import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {initial,digest,dispatch,reject} from './kernel.mjs';
import {Buffer} from 'node:buffer';
import {timingSafeEqual} from 'node:crypto';
const proofHash='9dde5d0861b8093cb7658603328a4765bb1eb8d9932301917515ec3e03412796';
const id='lab_gatepass_v1';
Deno.serve(async(req:Request)=>{const send=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});try{
 const proof=req.headers.get('x-lab-proof')||'';const actual=digest(proof);if(!proof||!timingSafeEqual(Buffer.from(actual),Buffer.from(proofHash)))reject('LAB gateway authentication required',401);
 if(req.method!=='POST')reject('Method not allowed',405);
 const text=await req.text();if(text.length>32768)reject('Payload too large',413);const {action,input={},owner=false,bearer='',origin}=JSON.parse(text);
 if(typeof origin!=='string'||!/^https:\/\/gatepass-lab-phuwitt(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin))reject('Unknown LAB origin',403);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 for(let tries=0;tries<7;tries++){
 const found=await db.from('gp_lab_rooms').select('state,revision').eq('id',id).maybeSingle();if(found.error)reject('อ่านฐานทดสอบไม่สำเร็จ',503);
 if(!found.data){if(!owner)reject('ผู้ดูแลต้องเปิดห้องทดลองก่อน',503);const inserted=await db.from('gp_lab_rooms').insert({id,state:initial(),revision:0});if(inserted.error&&inserted.error.code!=='23505')reject('สร้างห้องทดลองไม่สำเร็จ',503);continue;}
 const s=found.data.state;const mobile=typeof bearer==='string'&&bearer.length===64?s.mobiles.find((m:any)=>m.hash===digest(bearer)):null;
 if(action==='events.csv'){if(!owner)reject('ไม่มีสิทธิ์',401);return send({csv_events:s.events});}
 const result=dispatch(s,action,input,{owner,mobile,origin});
 if(result.mutates){const updated=await db.from('gp_lab_rooms').update({state:s,revision:found.data.revision+1,updated_at:new Date().toISOString()}).eq('id',id).eq('revision',found.data.revision).select('revision');if(updated.error)reject('บันทึกฐานทดสอบไม่สำเร็จ',503);if(!updated.data.length)continue;}
 return send(result.data);
 }
 reject('มีคำขอพร้อมกัน กรุณาลองใหม่',409);
 }catch(e){return send({error:e.status?e.message:'ระบบ LAB ไม่พร้อม'},e.status||503);}});
