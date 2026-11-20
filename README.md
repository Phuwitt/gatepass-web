# GATEPASS Web

โครงงาน CPE23267 · ชุดส่งซอร์ส 20 พฤศจิกายน 2569

เว็บผู้ดูแลสำหรับพนักงาน สิทธิ์เข้าออก ประวัติ เวลางาน การลา และดูภาพกล้องตามคำขอ ไม่มีการสแกนหน้า

| โฟลเดอร์ | หน้าที่ | ระบบออนไลน์ |
|---|---|---|
| `production/` | เว็บหลัก Next.js + Supabase Auth/PostgreSQL | https://gatepass-main-phuwitt.vercel.app |
| `lab/` | เว็บจำลอง 3D/ผู้ดูแล/API สำหรับแอป LAB | https://gatepass-lab-phuwitt.vercel.app |
| `docs/` | หลักฐานตรวจ build/API/browser และวัน deploy | ดูไฟล์ในโฟลเดอร์ |

เว็บหลักกับ LAB เป็นคนละ Vercel project ข้อมูล LAB อยู่เฉพาะ `gp_lab_rooms` ไม่ใช้ตารางพนักงานจริง แอป LAB ไม่เชื่อมเข้าเว็บ Production

## เริ่ม Production

ต้องมี Node.js 22 ขึ้นไปและ Supabase ของเจ้าของ

```sh
cd production
npm ci
cp .env.example .env.local
# กรอกค่าของเจ้าของใน .env.local โดยไม่ commit
npm run dev
```

เปิด http://localhost:3000 การตั้งค่า Supabase ต้องตรงกับฐานที่เตรียม migrations แล้ว ผู้ใช้รายใหม่ต้องตั้งค่าระบบ/บัญชีตามสิทธิ์ของเจ้าของ ไม่มีรหัส Admin เริ่มต้นใน repo

```sh
npm run typecheck
npm test
npm run build
```

Production ใช้ Next.js 16.4.6 (แพตช์ security) ห้ามนำ service-role key ไปใส่ `NEXT_PUBLIC_` หรือฝั่งมือถือ/บอร์ด

## เริ่ม LAB

```sh
cd lab
npm ci
npm test
```

ตัวเว็บเป็น static HTML + Vercel Node API + Supabase Edge Function ตั้ง Output Directory เป็น `public` และใช้ `vercel.json` ของ LAB แยกจาก Production ดู `lab/README.md`

## แยกเป็นสาม repo

- Web: repo นี้
- Mobile: https://github.com/Phuwitt/gatepass-mobile
- Hardware R1: https://github.com/Phuwitt/gatepass-hardware

## สถานะส่งงาน

เว็บหลัก Production ตรวจ build, TypeScript, tests 15 ชุดและ cloud health แล้ว ส่วน LAB มี tests 8 ชุดและตรวจ API ข้าม Vercel–Edge–Postgres รวม QR ใช้ครั้งเดียวและเปลี่ยนสิทธิ์ ไม่มีการล็อกอินแทนผู้ใช้ด้วยบัญชีจริงระหว่างตรวจ

PCB/PN532/กลอนจริงยังไม่ผ่านการทดสอบครบ สถานะ Production ของเว็บไม่ใช่หลักฐานว่าฮาร์ดแวร์พร้อม การสั่งกลอนจริงยังถูกปิดไว้ก่อน bench test

ไฟล์ `.env.local`, รหัสเปิด LAB, service keys และ metadata ของบัญชี cloud ไม่รวมอยู่ในชุดส่ง ซอร์สนี้ไม่มีสิทธิ์ deployment ของเจ้าของติดไป
