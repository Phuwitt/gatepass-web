import { isPreview, isHosted } from '../lib/server/supabase';
export const dynamic = 'force-dynamic';
import GatePass from '../components/GatePass';
export default function Page(){ return <GatePass preview={isPreview()} hosted={isHosted()}/>; }
