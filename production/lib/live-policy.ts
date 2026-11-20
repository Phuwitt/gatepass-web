export function faceDecision(input: {
  active: boolean;
  faceEnabled: boolean;
  enrolled: boolean;
  permission?: { starts: string; ends: string };
  now: string;
}) {
  if (!input.active) return { allowed: false, reason: "บัญชีพนักงานถูกระงับ" };
  if (!input.faceEnabled)
    return { allowed: false, reason: "พนักงานไม่ได้รับอนุญาตสแกนใบหน้า" };
  if (!input.enrolled)
    return { allowed: false, reason: "ข้อมูลใบหน้าถูกเพิกถอน" };
  if (!input.permission)
    return { allowed: false, reason: "ไม่มีสิทธิ์ประตูนี้" };
  if (
    input.now < input.permission.starts.slice(0, 5) ||
    input.now >= input.permission.ends.slice(0, 5)
  )
    return { allowed: false, reason: "อยู่นอกช่วงเวลาที่อนุญาต" };
  return {
    allowed: true,
    reason: "ยืนยันใบหน้าและผ่านสิทธิ์ · ทดสอบโดยไม่สั่งกลอน",
  };
}
export function chooseMatch(
  matches: { employee_id: string; score: number }[],
  threshold = 0.45,
  gap = 0.04,
) {
  const sorted = [...matches].sort((a, b) => b.score - a.score);
  const first = sorted[0];
  if (!first || !Number.isFinite(first.score) || first.score < threshold)
    return null;
  if (sorted[1] && first.score - sorted[1].score < gap) return null;
  return first;
}
