/** Shared by the real API and the isolated GATEPASS simulator. No database access.
 * @param {{employeeId:string|null,employeeActive?:boolean,methodEnabled?:boolean,permission?:{starts:string,ends:string}|null}} input
 * @param {Date} [now]
 */
export function evaluateAccess(input, now = new Date()) {
  const time = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now);
  let allowed = false, reason = 'ไม่พบข้อมูลยืนยันตัวตน';
  if (input.employeeId) {
    if (!input.employeeActive) reason = 'พนักงานถูกระงับ';
    else if (!input.methodEnabled) reason = 'ไม่ได้รับสิทธิ์ใช้วิธีนี้';
    else if (!input.permission) reason = 'ไม่มีสิทธิ์เข้าประตูนี้';
    else if (time < input.permission.starts || time >= input.permission.ends) reason = 'อยู่นอกช่วงเวลาที่อนุญาต';
    else { allowed = true; reason = 'มีสิทธิ์เข้าประตูตามช่วงเวลาที่กำหนด'; }
  }
  return {allowed, reason};
}
