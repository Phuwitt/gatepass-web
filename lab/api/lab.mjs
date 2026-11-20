import QRCode from 'qrcode';
import {createHmac,timingSafeEqual} from 'node:crypto';
function error(message,status=400){throw Object.assign(new Error(message),{status});}
const eq=(a,b)=>typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export default async function handler(req,res){const send=(data,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};try{
 const secret=process.env.LAB_OWNER_CODE;if(!secret||secret.length<24)error('ห้องทดลองยังไม่ตั้งค่ารหัส',503);
 const origin='https://'+req.headers.host,u=new URL(req.url,origin),route=String(req.query?.route||u.searchParams.get('route')||'lab').replace(/^\/+|\/+$/g,'');
 let body={};if(req.method==='POST'){if(req.headers.origin&&req.headers.origin!==origin)error('คำขอต่างเว็บไซต์',403);if(Buffer.byteLength(typeof req.body==='string'?req.body:JSON.stringify(req.body||{}))>32768)error('ข้อมูลใหญ่เกินไป',413);try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{error('ข้อมูลไม่ถูกต้อง');}}
 const expected=createHmac('sha256',secret).update('GATEPASS LAB OWNER v1').digest('hex'),cookie=(req.headers.cookie||'').match(/(?:^|;\s*)gp_lab_owner=([^;]+)/)?.[1]||'',owner=eq(cookie,expected);
 if(route==='login'&&req.method==='POST'){if(!eq(String(body.code||''),secret))error('รหัสเปิดห้องทดลองไม่ถูกต้อง',401);res.setHeader('Set-Cookie',`gp_lab_owner=${expected}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);return send({ready:true});}
 if(route==='bootstrap'){if(!owner)error('กรุณาเปิดห้องทดลอง',401);return send({ready:true});}
 const action=route==='lab'?String(body.action||''):route,bearer=(req.headers.authorization||'').replace(/^Bearer /,'');
 if(!owner&&!['pair-redeem','qr-info','qr-consume'].includes(action)&&!action.startsWith('mobile-'))error('กรุณาเปิดห้องทดลอง',401);
 const input=req.method==='GET'?Object.fromEntries(u.searchParams):body;
 const response=await fetch('https://exzqwzkagzhdcuyvcsoz.supabase.co/functions/v1/gatepass-lab-gateway',{method:'POST',headers:{'Content-Type':'application/json','x-lab-proof':secret},body:JSON.stringify({action,input,owner,bearer,origin}),signal:AbortSignal.timeout(18000)});const result=await response.json();if(!response.ok)error(result.error||'ระบบ LAB ไม่พร้อม',response.status);
 if(action==='events.csv'){const keys=['created_at','employee_id','method','status','reason'];const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="GATEPASS_LAB_EVENTS.csv"');return res.end('\uFEFF'+[keys,...result.csv_events.map(e=>keys.map(k=>e[k]))].map(r=>r.map(cell).join(',')).join('\r\n'));}
 if(['qr','pair'].includes(action))result.image=await QRCode.toDataURL(result.url,{width:320,margin:4});return send(result);
}catch(e){send({error:e.status?e.message:'ระบบ LAB ไม่พร้อม กรุณาลองใหม่'},e.status||503);}}
