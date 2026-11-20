import {z} from 'zod';
import {adminDb} from '../../../../lib/server/supabase';
import {actor,ApiError,audit,body,checked,checkOrigin,failure,limit,ok} from '../../../../lib/server/http';
export const runtime='nodejs';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const columns='id,employee_id,device_id,label,status,expires_at,last_four,credential_id';
export async function GET(req:Request){try{const who=await actor();const session=z.uuid().parse(new URL(req.url).searchParams.get('session'));const row=checked(await adminDb().from('gp_card_enrollments').select(columns).eq('id',session).eq('created_by',who.id).maybeSingle());if(!row)throw new ApiError('ไม่พบรายการลงทะเบียนของคุณ',404);return ok({...row,server_now:new Date().toISOString(),expired:Date.parse(row.expires_at)<=Date.now()&&row.status!=='confirmed'});}catch(e){return failure(e);}}
export async function POST(req:Request){try{checkOrigin(req);const who=await actor();limit('card-enrollment:'+who.id,30);const input=await body(req);const action=z.enum(['start','cancel','confirm']).parse(input.action);const db=adminDb();
 if(action==='start'){const v=z.object({action:z.literal('start'),employee_id:id,device_id:id,label:z.string().trim().min(1).max(80)}).strict().parse(input);
 const [p,d]=await Promise.all([db.from('gp_employees').select('id,active').eq('id',v.employee_id).maybeSingle(),db.from('gp_devices').select('id,revoked,last_seen,card_reader_ready').eq('id',v.device_id).maybeSingle()]);
 if(!checked(p)?.active)throw new ApiError('พนักงานไม่มีอยู่หรือถูกระงับ',409);const device=checked(d);if(!device||device.revoked)throw new ApiError('เครื่องไม่มีอยู่หรือถูกเพิกถอน',409);
 if(device.card_reader_ready!==true)throw new ApiError('เครื่องยังไม่รายงานว่า reader พร้อม กรุณาตรวจเฟิร์มแวร์และเครื่องอ่าน',409);
 if(!device.last_seen||Date.now()-Date.parse(device.last_seen)>45000)throw new ApiError('เครื่องยังไม่ติดต่อกลับ กรุณาเปิดเครื่องอ่านก่อน',409);
 checked(await db.from('gp_card_enrollments').update({status:'cancelled'}).eq('device_id',v.device_id).in('status',['waiting','captured']).lt('expires_at',new Date().toISOString()));
 const result=await db.from('gp_card_enrollments').insert({employee_id:v.employee_id,device_id:v.device_id,label:v.label,created_by:who.id}).select(columns).single();if(result.error?.code==='23505')throw new ApiError('เครื่องนี้กำลังลงทะเบียนให้รายการอื่น กรุณารอหรือยกเลิกรายการเดิม',409);const row=checked(result);if(!row)throw new ApiError("สร้างรายการไม่สำเร็จ",503);await audit(who.id,'เริ่มรอแตะบัตร',{employee:v.employee_id,device:v.device_id,session:row.id});return ok({...row,server_now:new Date().toISOString()});
 }
 const v=z.object({action:z.enum(['cancel','confirm']),session:z.uuid()}).strict().parse(input);
 if(action==='cancel'){const row=checked(await db.from('gp_card_enrollments').update({status:'cancelled'}).eq('id',v.session).eq('created_by',who.id).in('status',['waiting','captured']).select('id').maybeSingle());if(!row)throw new ApiError('รายการถูกยกเลิกหรือเสร็จแล้ว',409);await audit(who.id,'ยกเลิกรอแตะบัตร',{session:v.session});return ok({ok:true});}
 const result=await db.rpc('gp_confirm_card',{p_session:v.session,p_actor:who.id});if(result.error?.code==='23505')throw new ApiError('บัตรนี้ผูกอยู่แล้ว กรุณาตรวจเจ้าของเดิม ห้ามผูกทับ',409);if(result.error?.code==='P0001')throw new ApiError('รายการหมดอายุ ไม่พร้อม หรือบัญชี/เครื่องถูกระงับ กรุณาเริ่มใหม่',409);return ok({ok:true,credential_id:checked(result)});
}catch(e){return failure(e);}}
