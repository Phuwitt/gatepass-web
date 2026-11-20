# เว็บหลัก GATEPASS — Production

20 พฤศจิกายน 2569

เว็บจริง: https://gatepass-main-phuwitt.vercel.app
เว็บ LAB: https://gatepass-lab-phuwitt.vercel.app
APK ทดสอบ: https://gatepass-lab-phuwitt.vercel.app/GATEPASS-LAB-1.0.0.apk

## สิ่งที่เปลี่ยน

- เว็บหลักขึ้น Production ใช้บัญชี/ฐาน Supabase เดิม ไม่มีข้อมูลจำลองแทรกเข้าตารางพนักงานจริง
- ใช้ค่าฐานข้อมูลเดิมกับ Production ผ่านการขยาย target ของ env ที่เก็บบน Vercel ไม่อ่านหรือเปลี่ยนค่า secret
- หน้าเข้าสู่ระบบและหน้าแดชบอร์ดหลักไม่แสดง Prototype; คำแนะนำฐาน cloud ถูกแยกจาก local bench
- mode ของ health เป็น production และ production มีลำดับเหนือ preview flag เก่าที่อาจค้าง
- แพตช์ Next.js 16.4.3 → 16.4.6 ตามผล npm audit; หลังติดตั้งไม่พบช่องโหว่ใน audit
- เพิ่มโดเมน gatepass-main-phuwitt.vercel.app เป็น project domain ที่ตาม Production ในครั้งถัดไป ลิงก์ project เดิมยังอยู่

## ตรวจแล้ว

Build, TypeScript, 15 tests ผ่าน; public health ตอบ production/database=true/cloud; auth status configured/databaseReady=true และไม่ต้องตั้ง Admin ใหม่; ไม่ล็อกอินเข้าข้อมูลพนักงานโดยใช้บัญชีจริงระหว่างตรวจ

Anonymous admin request ได้ 401, คำขอ login ต่าง origin จาก LAB ได้ 403; หน้า desktop/mobile ตรวจแล้วไม่มี Prototype และไม่มี browser errors

## การแยกระบบ

แอป GATEPASS LAB เป็น package แยกและใช้ backend LAB เท่านั้น คู่มือ/รหัส LAB อยู่ gatepass-lab-cloud/private/LAB_ACCESS_TH.txt (อ้างจากราก workspace) ใน workspace (ไม่แจกบนเว็บ) ไม่มีการบิวด์หรือติดตั้งแอป GATEPASS ตัวจริงใหม่ในรอบนี้

เว็บจริงพร้อมใช้งานส่วนเว็บ/ฐานข้อมูล การต่อกลอน/PN532/กล้องบนบอร์ดจริงยังต้องตรวจฮาร์ดแวร์แยกและไม่ได้เปิด actuation จากงาน deploy นี้

แอปพนักงานตัวจริงรุ่นเดิมมีรายการ trusted QR origins ที่กำหนดไว้แล้ว การใช้ QR จากโดเมน Production ใหม่กับ APK ตัวจริงต้องตรวจ/อัปเดตรายการนี้ก่อนปล่อยแอปรอบถัดไป งานคืนนี้ใช้แอป LAB กับเว็บ LAB แยกตามที่ผู้ใช้ขอ
