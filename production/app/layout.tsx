import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'GATEPASS · Workspace', robots: { index: false, follow: false }, description: 'จัดการพนักงาน สิทธิ์ประตู และข้อมูลเข้าออกในที่เดียว' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="th"><body>{children}</body></html>; }
