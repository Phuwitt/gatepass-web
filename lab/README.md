# GATEPASS LAB Web / API

เว็บทดสอบ: https://gatepass-lab-phuwitt.vercel.app
ดาวน์โหลด APK: https://gatepass-lab-phuwitt.vercel.app/download.html

ซอร์ส static อยู่ `public/`, API gateway บน Vercel อยู่ `api/`, กฎทดสอบอยู่ `lib/`, Supabase Edge อยู่ `edge/`

`npm ci` แล้ว `npm test` เพื่อตรวจ business logic และ native route

Deployment แยก Vercel project จากเว็บหลัก ตั้ง `LAB_OWNER_CODE` เป็น Sensitive Env และให้ `edge/index.ts` ใช้ SHA-256 proof hash ที่ตรงกับรหัสนี้ กุญแจจริงไม่รวมใน Git รหัส service-role ใช้จาก Supabase Edge runtime ภายในเท่านั้น

ฐาน LAB: `database/schema.sql` (service-only + RLS ไม่เปิด client policies) และห้อง `lab_gatepass_v1` ใช้ revision compare-and-swap ป้องกันใช้ QR พร้อมกันสำเร็จหลายคำขอ

จับคู่แอป: ผู้ดูแลเลือกพนักงานและสร้าง QR อายุ 5 นาทีใช้ครั้งเดียว แอปได้ bearer token ที่ผูกกับพนักงานและตรวจสิทธิ์ที่ server QR ประตูอายุ 60 วินาทีใช้ครั้งเดียว

NFC/บัตรในฉากและปุ่มมือถือเป็นคำขอจำลอง ไม่ส่งคลื่น NFC ไม่สั่งกลอนจริง ไม่มีการสแกนหน้า

ลิงก์ APK ในเว็บอ้างไฟล์แจกที่ deployment จริง ไม่ commit APK ขนาดใหญ่ลง repo ซอร์ส หากจะ deploy จาก clone ใหม่ ให้แนบ APK release จาก repo mobile ใน `public/GATEPASS-LAB-1.0.0.apk` หรือแก้ลิงก์ดาวน์โหลดให้ตรงที่เก็บไฟล์ของเจ้าของก่อน deploy
