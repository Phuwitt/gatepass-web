import type {
  Person,
  LiveEvent,
  Leave,
  LiveDevice,
  Review,
  Adjustment,
} from "./live-types";
export const methodNames: Record<string, string> = {
  face: "ใบหน้า",
  card: "บัตร",
  nfc: "NFC มือถือ",
  qr: "QR",
};
export const statusNames: Record<string, string> = {
  allowed: "อนุญาต",
  denied: "ปฏิเสธ",
  error: "ประมวลผลไม่สำเร็จ",
  processing: "กำลังตรวจ",
  pending: "รอพิจารณา",
  approved: "อนุมัติ",
  rejected: "ไม่อนุมัติ",
};
export function thaiDay(date: string | number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)?.value)
    .join("-");
}
function minutesAt(date: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(date));
  return (
    Number(parts.find((p) => p.type === "hour")?.value) * 60 +
    Number(parts.find((p) => p.type === "minute")?.value)
  );
}
const minutes = (t: string) =>
  Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export function attendance(
  person: Person,
  day: string,
  events: LiveEvent[],
  leaves: Leave[],
  adjustments: Adjustment[] = [],
) {
  const rows = events
    .filter((e) => e.employee_id === person.id && thaiDay(e.created_at) === day)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const allowed = rows.filter((e) => e.status === "allowed");
  const ins = allowed.filter((e) => e.direction === "in"),
    outs = allowed.filter((e) => e.direction === "out");
  const leave = leaves.find(
    (l) =>
      l.employee_id === person.id &&
      l.status === "approved" &&
      l.starts <= day &&
      l.ends >= day,
  );
  const approved = adjustments.find(
    (a) =>
      a.employee_id === person.id && a.day === day && a.status === "approved",
  );
  if (approved) {
    const late = Math.max(
      0,
      minutes(approved.requested_in) -
        minutes(person.work_start || "09:00") -
        (person.grace_minutes || 0),
    );
    return {
      status: leave ? "ลา" : late ? "สาย" : "เข้างาน",
      first: day + "T" + approved.requested_in + "+07:00",
      last: day + "T" + approved.requested_out + "+07:00",
      late,
      minutes: minutes(approved.requested_out) - minutes(approved.requested_in),
      incomplete: false,
      leave: !!leave,
      corrected: true,
    };
  }
  let opened: number | null = null,
    total = 0,
    pairs = 0,
    unpaired = false;
  for (const e of allowed) {
    if (e.direction === "in" && opened === null)
      opened = Date.parse(e.created_at);
    if (e.direction === "out") {
      if (opened !== null) {
        total += Math.max(0, (Date.parse(e.created_at) - opened) / 60000);
        pairs++;
        opened = null;
      } else unpaired = true;
    }
  }
  const first = ins[0],
    last = outs.at(-1);
  const late = first
    ? Math.max(
        0,
        minutesAt(first.created_at) -
          minutes(person.work_start || "09:00") -
          (person.grace_minutes || 0),
      )
    : 0;
  const status = leave
    ? "ลา"
    : first
      ? late
        ? "สาย"
        : "เข้างาน"
      : allowed.length
        ? "ไม่ระบุทิศทาง"
        : rows.some((e) => e.status === "denied")
          ? "ถูกปฏิเสธ"
          : "ยังไม่มีบันทึก";
  return {
    status,
    first: first?.created_at || null,
    last: last?.created_at || null,
    late,
    minutes: pairs ? Math.floor(total) : null,
    incomplete:
      opened !== null ||
      unpaired ||
      allowed.some((e) => !e.direction || e.direction === "unspecified"),
    leave: !!leave,
    corrected: false,
  };
}
export type HRAlert = {
  key: string;
  title: string;
  detail: string;
  level: "high" | "medium";
  device_id: string;
  event_id?: string;
};
export function alerts(
  devices: LiveDevice[],
  events: LiveEvent[],
  reviews: Review[],
  now: number,
): HRAlert[] {
  const result: HRAlert[] = [];
  for (const d of devices.filter((d) => !d.revoked)) {
    if (d.last_seen && now - Date.parse(d.last_seen) >= 45000)
      result.push({
        key: `offline:${d.id}:${d.last_seen}`,
        title: "เครื่องออฟไลน์",
        detail: d.name,
        level: "medium",
        device_id: d.id,
      });
    // Sensor alerts are based only on supplied readings, never inferred from an image.
    if (d.tamper === true)
      result.push({
        key: `tamper:${d.id}:${d.tamper_since || "unknown"}`,
        title: "ตรวจพบการเปิดฝาเครื่อง",
        detail: d.name,
        level: "high",
        device_id: d.id,
      });
    if (
      d.door_open === true &&
      d.door_open_since &&
      now - Date.parse(d.door_open_since) > 60000
    )
      result.push({
        key: `held:${d.id}:${d.door_open_since}`,
        title: "ประตูเปิดค้างเกิน 1 นาที",
        detail: d.name,
        level: "high",
        device_id: d.id,
      });
    const recent = events.filter(
      (e) =>
        e.device_id === d.id &&
        e.status === "denied" &&
        now - Date.parse(e.created_at) <= 600000 &&
        now >= Date.parse(e.created_at),
    );
    if (recent.length >= 3)
      result.push({
        key: `repeat:${d.id}:${recent[0].id}`,
        title: "ถูกปฏิเสธซ้ำ",
        detail: `${d.name} · ${recent.length} ครั้งใน 10 นาที`,
        level: "high",
        device_id: d.id,
        event_id: recent[0].id,
      });
  }
  return result.filter(
    (a) =>
      !reviews.some(
        (r) => r.source_key === a.key && r.decision !== "follow_up",
      ),
  );
}
