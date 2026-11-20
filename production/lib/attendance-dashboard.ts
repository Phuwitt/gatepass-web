import {attendance,thaiDay} from './hr';
import type{Person,LiveEvent,Leave,Adjustment}from'./live-types';
export type DashboardConfig={id:string;name:string;department:string;job_title:string;view:'both'|'summary'|'arrival'};
export function dateRange(start:string,end:string){const days:string[]=[];let day=start;while(day<=end&&days.length<32){days.push(day);day=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);}return days;}
export function dashboardReport(people:Person[],events:LiveEvent[],leaves:Leave[],adjustments:Adjustment[],days:string[],filter:Pick<DashboardConfig,'department'|'job_title'>){
 const persons=people.filter(p=>p.active&&(!filter.department||p.department===filter.department)&&(!filter.job_title||p.job_title===filter.job_title));
 const grouped=new Map<string,LiveEvent[]>();for(const ev of events){if(!ev.employee_id)continue;const key=ev.employee_id+'|'+thaiDay(ev.created_at);const g=grouped.get(key)||[];g.push(ev);grouped.set(key,g);}
 const bins=Array.from({length:48},(_,i)=>({label:String(Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00'),count:0}));
 let onTime=0,late=0,leave=0,unrecorded=0,unknown=0,present=0,corrected=0,eligible=0;const rows=[];
 for(const p of persons)for(const day of days){if(p.hired_on&&p.hired_on>day)continue;eligible++;const entries=grouped.get(p.id+'|'+day)||[];const ambiguous=entries.some(e=>e.status==='allowed'&&(!e.direction||e.direction==='unspecified'));const a=attendance(p,day,entries,leaves,adjustments);if(a.corrected)corrected++;
 if(a.first&&!a.leave){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(a.first));const h=Number(parts.find(x=>x.type==='hour')?.value),m=Number(parts.find(x=>x.type==='minute')?.value);bins[Math.floor((h*60+m)/30)].count++;}
 if(a.leave)leave++;else if(a.first){present++;if(a.late>0)late++;else onTime++;}else if(ambiguous)unknown++;else unrecorded++;
 rows.push({employee_id:p.id,name:p.name,department:p.department,job_title:p.job_title||'',day,first:a.first,status:a.leave?'ลา':a.first?(a.late?'สาย':'ตรงเวลา'):a.status==='ไม่ระบุทิศทาง'&&!ambiguous?'ยังไม่มีบันทึกเข้า':a.status,late:a.late,corrected:a.corrected});
 }
 return {people:persons.length,days:days.length,eligible,present,onTime,late,leave,unrecorded,unknown,corrected,onTimeRate:present?Math.round(onTime/present*1000)/10:null,lateRate:present?Math.round(late/present*1000)/10:null,bins,rows:rows.slice(0,200),rowCount:rows.length};
}
