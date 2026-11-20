# GATEPASS Production Web

เว็บหลักออนไลน์: https://gatepass-main-phuwitt.vercel.app

ในโฟลเดอร์นี้รัน `npm ci`, คัดลอก `.env.example` เป็น `.env.local` และกรอก Supabase URL/keys ของเจ้าของ จากนั้น `npm run dev`

ตรวจด้วย `npm run typecheck`, `npm test`, `npm run build`

ฐานข้อมูล: ดู `supabase/migrations` เป็นประวัติ schema ของระบบ ไม่ให้รันล้าง/reset ฐานจริงเพื่อทดลอง ควรเตรียมฐานแยกเมื่อตรวจ migrations ครั้งแรก

หน้าเว็บมี Admin/HR/Employee, พนักงาน, ประตูและสิทธิ์, บัตร/NFC/QR, ประวัติ, dashboard เวลางานและคำขอลา กล้องมีเฉพาะเปิดดูภาพตามคำขอ ไม่มีสแกนหน้า

API `/api/v1/health` แยก `production/preview/local`; `/api/device/qr-status` ใช้ตรวจผล QR ของเครื่องที่ยืนยันตัวตนแล้ว การสั่งกลอนต้องเปิดจาก server และ firmware และยังไม่เปิดก่อนตรวจฮาร์ดแวร์

Source ที่แยกมาชุดนี้นำคำสั่งเริ่ม face service/Wokwi รุ่นเก่าออกจาก package scripts เพราะไม่ใช่ส่วนของเว็บ Production ปัจจุบัน ส่วนเฟิร์มแวร์ R1 อยู่ repo hardware แยก

แอป employee รุ่นเดิมมี trusted QR origins ของตัวเอง ต้องตรวจรายการก่อนใช้โดเมนใหม่กับ APK ตัวจริง งานพรีเซนต์ครั้งนี้ใช้แอป LAB คู่กับเว็บ LAB แยกตามแผน
