"use client";
import CardEnrollment from "./CardEnrollment";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  Adjustment,
  Credential,
  Leave,
  LiveEvent,
  Method,
  Review,
  Workspace,
} from "../lib/live-types";
import {
  alerts,
  attendance,
  methodNames,
  statusNames,
  thaiDay,
} from "../lib/hr";
import EntranceCameras from "./EntranceCameras";
type Data = {
  month: string;
  events: LiveEvent[];
  methods: Method[];
  credentials: Credential[];
  leaves: Leave[];
  reviews: Review[];
  truncated: boolean;
  adjustments: Adjustment[];
};
type Props = {
  page: string;
  workspace: Workspace;
  person: string;
  select: (id: string) => void;
  go: (page: string) => void;
  refresh: () => Promise<void>;
};
const stamp = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const labelDirection = (s?: string) =>
  s === "in" ? "เข้า" : s === "out" ? "ออก" : "ยังไม่ระบุ";
async function request(path: string, data?: unknown) {
  const r = await fetch(
    path,
    data
      ? {
          signal: AbortSignal.timeout(15000),
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : { cache: "no-store", signal: AbortSignal.timeout(15000) },
  );
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "เชื่อมต่อไม่ได้");
  return result;
}
function GridTable({ heads, rows }: { heads: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty">ไม่พบรายการตามตัวกรอง</div>}
    </div>
  );
}
function csv(name: string, rows: (string | number)[][]) {
  const val = (v: string | number) => {
    let s = String(v);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + rows.map((r) => r.map(val).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function HRWorkspace({
  page,
  workspace: s,
  person,
  select,
  go,
  refresh,
}: Props) {
  const [month, setMonth] = useState(thaiDay(Date.now()).slice(0, 7)),
    [day, setDay] = useState(thaiDay(Date.now()));
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(""),
    [department, setDepartment] = useState(""),
    [status, setStatus] = useState(""),
    [method, setMethod] = useState("");
  const [eventId, setEventId] = useState(""),
    [showCamera, setShowCamera] = useState(false),
    [reviewFilter, setReviewFilter] = useState("pending");
  const [nfc, setNfc] = useState(""),
    [qr, setQr] = useState<{
      url: string;
      expires_at: string;
      image: string;
      device_id: string;
    } | null>(null),
    [now, setNow] = useState(Date.now());
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const result = await request("/api/hr/workspace?month=" + month);
      if (version !== loadVersion.current) return;
      setData(result);
      setError("");
    } catch (e) {
      if (version === loadVersion.current)
        setError(e instanceof Error ? e.message : "อ่านข้อมูลไม่ได้");
    }
  }, [month]);
  useEffect(() => {
    void load();
    return () => {
      loadVersion.current++;
    };
  }, [load, s]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setNfc("");
  }, [person, page]);
  useEffect(() => {
    setShowCamera(false);
  }, [eventId]);
  async function send(resource: string, value: unknown, base = "/api/hr/") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await request(base + resource, value);
      if (r.nfc_credential) setNfc(r.nfc_credential);
      if (r.image) setQr(r);
      setNotice("บันทึกแล้ว");
      await refresh();
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่ได้");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const fields = (e: FormEvent<HTMLFormElement>) =>
    Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
  const employee = s.employees.find((e) => e.id === person);
  const event = data?.events.find((e) => e.id === eventId);
  const activeAlerts = useMemo(
    () => (data ? alerts(s.devices, data.events, data.reviews, now) : []),
    [s.devices, data, now],
  );
  function ready(id: string, m: string) {
    return (
      !!data?.methods.some(
        (g) => g.employee_id === id && g.method === m && g.enabled,
      ) &&
      (m === "qr" ||
        !!data.credentials.some(
          (c) => c.employee_id === id && c.method === m && !c.revoked,
        ))
    );
  }
  const dayEvents = data?.events || [],
    leaves = data?.leaves || [];
  const result = (p: Workspace["employees"][number], date = day) =>
    attendance(p, date, dayEvents, leaves, data?.adjustments || []);
  const directory = s.employees.filter((p) => {
    const statusToday = result(p, thaiDay(now)).status;
    return (
      (p.id + p.name + p.email + p.department + (p.job_title||""))
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!department || p.department === department) &&
      (!status ||
        (status === "inactive"
          ? !p.active
          : status === "active"
            ? p.active
            : statusToday === status)) &&
      (!method ||
        (method === "none"
          ? !["card", "nfc", "qr"].some((m) => ready(p.id, m))
          : ready(p.id, method)))
    );
  });
  if (!data)
    return (
      <section className="panel" aria-busy="true">
        <p role={error ? "alert" : "status"}>
          {error || "กำลังอ่านข้อมูล HR…"}
        </p>
        {error && <button onClick={load}>ลองใหม่</button>}
      </section>
    );
  const message = (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="note">
          {notice}
        </p>
      )}
      {data.truncated && (
        <p role="alert" className="note">
          เดือนนี้เกิน 10,000 เหตุการณ์ แสดงข้อมูลบางส่วน
          กรุณายังไม่ใช้ยอดนี้สรุปเวลางาน
        </p>
      )}
    </>
  );
  if (page === "directory")
    return (
      <section className="panel">
        <h2>รายชื่อพนักงาน</h2>
        {message}
        <div className="hr-toolbar">
          <label>
            ค้นหาพนักงาน
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ชื่อ รหัส อีเมล แผนก หรือตำแหน่ง"
            />
          </label>
          <label>
            แผนก
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">ทุกแผนก</option>
              {[
                ...new Set(
                  s.employees.map((e) => e.department).filter(Boolean),
                ),
              ].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            สถานะวันนี้
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {[
                "เข้างาน",
                "สาย",
                "ลา",
                "ถูกปฏิเสธ",
                "ยังไม่มีบันทึก",
                "ไม่ระบุทิศทาง",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
              <option value="inactive">ระงับบัญชี</option>
              <option value="active">บัญชีใช้งานอยู่</option>
            </select>
          </label>
          <label>
            วิธีที่พร้อมใช้
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">ทุกวิธี</option>
              {Object.entries(methodNames).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
              <option value="none">ยังไม่พร้อมใช้</option>
            </select>
          </label>
        </div>
        <p>
          {directory.length} จาก {s.employees.length} คน ·
          สถานะวันนี้อิงบันทึกและการลาที่อนุมัติ ไม่ถือว่าคนไม่มีบันทึกขาดงาน
        </p>
        <GridTable
          heads={[
            "พนักงาน",
            "แผนก",
            "วิธีที่พร้อมใช้",
            "วันนี้",
            "สถานะบัญชี",
            "จัดการ",
          ]}
          rows={directory.map((p) => [
            <div key={p.id}>
              <strong>{p.name}</strong>
              <small>
                {p.id} · {p.email || "ไม่ระบุอีเมล"}
              </small>
            </div>,
            <div key={p.id+"-job"}>{p.department || "ยังไม่ระบุแผนก"}<small>{p.job_title||"ยังไม่ระบุตำแหน่ง"}</small></div>,
            <div key={p.id} className="actions">
              {Object.entries(methodNames)
                .filter(([m]) => ready(p.id, m))
                .map(([m, n]) => (
                  <span className="badge good" key={m}>
                    {n}
                  </span>
                ))}
              {!["card", "nfc", "qr"].some((m) => ready(p.id, m)) &&
                "ยังไม่พร้อมใช้"}
            </div>,
            result(p, thaiDay(now)).status,
            p.active ? "ใช้งานอยู่" : "ระงับ",
            <div className="actions" key={p.id}>
              <button
                onClick={() => {
                  select(p.id);
                  go("employee-detail");
                }}
              >
                ดูรายละเอียด
              </button>
              <button
                onClick={() => {
                  select(p.id);
                  go("rights");
                }}
              >
                สิทธิ์ประตู
              </button>
            </div>,
          ])}
        />
      </section>
    );
  if (page === "employee-detail") {
    if (!employee)
      return (
        <section className="panel">
          <p>เลือกพนักงานจากรายชื่อก่อน</p>
          <button onClick={() => go("employees")}>ไปที่พนักงาน</button>
        </section>
      );
    const mine = data.events.filter((e) => e.employee_id === person),
      myCredentials = data.credentials.filter((c) => c.employee_id === person),
      days = [
        ...new Set([
          ...mine.map((e) => thaiDay(e.created_at)),
          ...data.adjustments
            .filter((a) => a.employee_id === person && a.status === "approved")
            .map((a) => a.day),
        ]),
      ];
    return (
      <>
        {message}
        <div className="actions hr-breadcrumb">
          <button onClick={() => go("employees")}>กลับรายชื่อ</button>
          <strong>
            {employee.id} · {employee.name}
          </strong>
        </div>
        <CardEnrollment key={person} employeeId={person} employeeName={employee.name} devices={s.devices} onComplete={()=>{void load();refresh();}}/>
        <div className="dashboard-grid">
          <section className="panel">
            <h2>ข้อมูลส่วนตัวและเวลางาน</h2>
            <p>
              {employee.email || "ไม่ระบุอีเมล"} ·{" "}
              {employee.department || "ไม่ระบุแผนก"}
            </p>
            <form
              className="live-form"
              key={person}
              onSubmit={(e) => {
                e.preventDefault();
                const v = fields(e);
                void send("profile", {
                  id: person,
                  ...v,
                  grace_minutes: Number(v.grace_minutes),
                });
              }}
            >
              <div className="form-grid">
                <label>
                  ชื่อพนักงาน
                  <input
                    name="name"
                    defaultValue={employee.name}
                    maxLength={120}
                    required
                  />
                </label>
                <label>
                  อีเมล
                  <input
                    name="email"
                    type="email"
                    defaultValue={employee.email}
                  />
                </label>
                <label>
                  แผนก
                  <input
                    name="department"
                    defaultValue={employee.department}
                    list="detail-departments"
                    maxLength={120}
                  />
                </label>
                <datalist id="detail-departments">{[...new Set(s.employees.map(p=>p.department).filter(Boolean))].sort().map(v=><option key={v} value={v}/>)}</datalist>
                <label>ตำแหน่งงาน<input name="job_title" maxLength={120} defaultValue={employee.job_title||""} placeholder="เช่น หัวหน้าบัญชี" list="detail-jobs"/></label>
                <datalist id="detail-jobs">{[...new Set(s.employees.map(p=>p.job_title).filter(Boolean))].sort().map(v=><option key={v} value={v}/>)}</datalist>
                <label>
                  เบอร์โทรศัพท์
                  <input
                    name="phone"
                    defaultValue={employee.phone || ""}
                    maxLength={30}
                  />
                </label>
                <label>
                  วันที่เริ่มงาน
                  <input
                    name="hired_on"
                    type="date"
                    defaultValue={employee.hired_on || ""}
                  />
                </label>
                <label>
                  เริ่มงาน
                  <input
                    name="work_start"
                    type="time"
                    defaultValue={employee.work_start?.slice(0, 5) || "09:00"}
                    required
                  />
                </label>
                <label>
                  เลิกงาน
                  <input
                    name="work_end"
                    type="time"
                    defaultValue={employee.work_end?.slice(0, 5) || "18:00"}
                    required
                  />
                </label>
                <label>
                  ผ่อนผันมาสายเป็นนาที
                  <input
                    name="grace_minutes"
                    type="number"
                    min={0}
                    max={120}
                    defaultValue={employee.grace_minutes || 0}
                    required
                  />
                </label>
              </div>
              <small>
                เวลางานใช้สรุปการมาสาย แยกจากช่วงเวลาที่อนุญาตเข้าประตู
              </small>
              <button className="primary" disabled={busy}>
                บันทึกเวลางาน
              </button>
            </form>
            <div className="actions hr-space">
              <button onClick={() => go("rights")}>จัดการสิทธิ์ประตู</button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      `${employee.active ? "ระงับ" : "เปิดใช้งาน"}พนักงาน ${employee.name}?`,
                    )
                  )
                    void send(
                      "employee-status",
                      {
                        id: person,
                        active: !employee.active,
                      },
                      "/api/admin/",
                    );
                }}
              >
                {employee.active ? "ระงับพนักงาน" : "เปิดใช้งานพนักงาน"}
              </button>
            </div>
          </section>
          <section className="panel">
            <h2>วิธียืนยันตัวตน</h2>
            <p>อนุญาตได้หลายวิธี ใช้เพียงหนึ่งวิธีต่อครั้ง</p>
            <div className="hr-methods">
              {(["card", "nfc", "qr"] as const).map((m) => (
                <label className="check" key={m}>
                  <input
                    type="checkbox"
                    checked={data.methods.some(
                      (g) =>
                        g.employee_id === person && g.method === m && g.enabled,
                    )}
                    disabled={busy}
                    onChange={(e) =>
                      void send("method", {
                        employee_id: person,
                        method: m,
                        enabled: e.target.checked,
                      })
                    }
                  />
                  {methodNames[m]} ·{" "}
                  {ready(person, m) ? "พร้อมใช้" : "ยังไม่พร้อมใช้"}
                </label>
              ))}
            </div>
            <p className="note">
              บัตรและ NFC ต้องเชื่อมเครื่องอ่านจริงก่อนใช้งาน การแตะมือถือ
              Android ต้องมีแอป HCE เพิ่ม เว็บไซต์ไม่สามารถแทนบัตร NFC ได้เอง
            </p>
            <form
              className="live-form"
              onSubmit={(e) => {
                e.preventDefault();
                const v = fields(e);
                void send("credential", {
                  employee_id: person,
                  method: v.method,
                  label: v.label,
                  ...(v.method === "card" ? { uid: v.uid } : {}),
                });
              }}
            >
              <label>
                ประเภท
                <select name="method">
                  <option value="card">บัตร RFID / NFC (กรอก UID เอง)</option>
                  <option value="nfc">ข้อมูลสำหรับแอป Android HCE</option>
                </select>
              </label>
              <label>
                ชื่อบัตรหรือมือถือ
                <input name="label" maxLength={80} required />
              </label>
              <label>
                UID บัตร
                <input
                  name="uid"
                  placeholder="เช่น 04 A1 B2 C3 D4 E5 F6"
                  maxLength={80}
                />
              </label>
              <small>
                UID ใช้กับบัตรเท่านั้น NFC มือถือจะสร้างข้อมูลยืนยันแบบสุ่มให้
              </small>
              <button disabled={busy}>ลงทะเบียนข้อมูลยืนยัน</button>
            </form>
            {nfc && (
              <div className="note" role="status">
                <strong>ข้อมูล NFC แสดงครั้งเดียว</strong>
                <code className="hr-secret">{nfc}</code>
                <small>
                  เก็บในแอป HCE ของพนักงาน ห้ามใช้ service role key บนมือถือ
                </small>
                <button onClick={() => setNfc("")}>ซ่อนข้อมูล</button>
              </div>
            )}
          </section>
        </div>
        <section className="panel">
          <h2>บัตรและมือถือที่ลงทะเบียน</h2>
          <p>
            UID บัตรอาจถูกคัดลอกได้ การอ่าน UID
            เพียงอย่างเดียวยังไม่ใช่การยืนยันแบบเข้ารหัส
          </p>
          <GridTable
            heads={["ชื่อ", "วิธี", "ท้ายรหัส", "สถานะ", "จัดการ"]}
            rows={myCredentials.map((c) => [
              c.label,
              methodNames[c.method],
              "…" + c.last_four,
              c.revoked ? "เพิกถอน" : "ลงทะเบียนแล้ว",
              <button
                key={c.id}
                disabled={busy || c.revoked}
                className="danger"
                onClick={() => {
                  if (confirm("เพิกถอนข้อมูลนี้?"))
                    void send("credential-revoke", { id: c.id });
                }}
              >
                เพิกถอน
              </button>,
            ])}
          />
        </section>
        {s.user.role === "Admin" && (
          <section className="panel">
            <h2>บัญชีเว็บพนักงานสำหรับ QR และการลา</h2>
            {employee.auth_user_id ? (
              <p>ผูกบัญชีพนักงานแล้ว สิทธิ์นี้เข้าเว็บ HR ไม่ได้</p>
            ) : (
              <form
                className="live-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = fields(e);
                  void send("employee-account", { employee_id: person, ...v });
                }}
              >
                <label>
                  อีเมลล็อกอิน
                  <input
                    name="email"
                    type="email"
                    defaultValue={employee.email}
                    required
                  />
                </label>
                <label>
                  รหัสผ่านแรกเข้า
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <button disabled={busy}>สร้างบัญชีพนักงาน</button>
              </form>
            )}
          </section>
        )}
        <section className="panel">
          <h2>ประวัติและสรุปเดือนที่เลือก</h2>
          <label>
            เดือน
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <p>
            มีบันทึกเข้า{" "}
            {days.filter((day) => result(employee, day).first).length} วัน · สาย{" "}
            {days.filter((day) => result(employee, day).late > 0).length} วัน ·
            ไม่นับเป็นขาดงานอัตโนมัติ
          </p>
          <GridTable
            heads={["เวลา", "วิธี", "ทิศทาง", "ผล", "เหตุผล"]}
            rows={mine
              .slice(0, 50)
              .map((e) => [
                stamp(e.created_at),
                methodNames[e.method || "face"],
                labelDirection(e.direction),
                statusNames[e.status] || e.status,
                e.reason,
              ])}
          />
        </section>
      </>
    );
  }
  if (page === "attendance") {
    const rows = s.employees.map((p) => ({ p, r: result(p) }));
    return (
      <>
        {message}
        <section className="panel">
          <h2>เวลางานและรายงาน</h2>
          <div className="hr-toolbar">
            <label>
              วันที่
              <input
                type="date"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  setMonth(e.target.value.slice(0, 7));
                }}
                required
              />
            </label>
            <button
              disabled={data.truncated}
              onClick={() =>
                csv("GATEPASS_attendance_" + day + ".csv", [
                  [
                    "วันที่",
                    "รหัส",
                    "ชื่อ",
                    "สถานะ",
                    "เข้า",
                    "ออก",
                    "สาย นาที",
                    "นาทีจากคู่เข้าออก",
                    "ข้อมูลครบ",
                  ],
                  ...rows.map(({ p, r }) => [
                    day,
                    p.id,
                    p.name,
                    r.status,
                    stamp(r.first),
                    stamp(r.last),
                    r.late,
                    r.minutes ?? "",
                    r.corrected
                      ? "HR อนุมัติแก้เวลา"
                      : r.incomplete
                        ? "ไม่ครบ"
                        : "ครบ",
                  ]),
                ])
              }
            >
              ส่งออกรายงาน CSV
            </button>
          </div>
          <p>
            ต้องกำหนดเครื่องเป็นขาเข้าหรือขาออกก่อน
            คำนวณเฉพาะผลอนุญาตและคู่เข้าออกครบ
            ไม่ใช้ยอดนี้คำนวณเงินเดือนเมื่อข้อมูลไม่ครบ
          </p>
          <GridTable
            heads={[
              "พนักงาน",
              "สถานะ",
              "เข้าแรก",
              "ออกล่าสุด",
              "สาย",
              "เวลาจากคู่เข้าออก",
            ]}
            rows={rows.map(({ p, r }) => [
              p.name,
              r.status,
              stamp(r.first),
              stamp(r.last),
              r.first ? r.late + " นาที" : "—",
              r.minutes === null
                ? "ยังคำนวณไม่ได้"
                : `${r.minutes} นาที${r.corrected ? " · HR อนุมัติแก้เวลา" : r.incomplete ? " · ข้อมูลไม่ครบ" : ""}`,
            ])}
          />
        </section>
        <section className="panel">
          <h2>บันทึกการลาโดย HR</h2>
          <form
            className="live-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send("leave", fields(e));
            }}
          >
            <div className="form-grid">
              <label>
                พนักงาน
                <select name="employee_id">
                  {s.employees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ประเภท
                <select name="kind">
                  <option value="sick">ลาป่วย</option>
                  <option value="personal">ลากิจ</option>
                  <option value="annual">ลาพักร้อน</option>
                </select>
              </label>
              <label>
                เริ่ม
                <input type="date" name="starts" required />
              </label>
              <label>
                สิ้นสุด
                <input type="date" name="ends" required />
              </label>
              <label>
                สถานะ
                <select name="status">
                  <option value="pending">รอพิจารณา</option>
                  <option value="approved">อนุมัติ</option>
                  <option value="rejected">ไม่อนุมัติ</option>
                </select>
              </label>
            </div>
            <label>
              เหตุผล
              <textarea name="reason" minLength={3} maxLength={1000} required />
            </label>
            <button disabled={busy || !s.employees.length}>บันทึกการลา</button>
          </form>
        </section>
        <section className="panel">
          <h2>คำขอแก้เวลางาน</h2>
          <p>
            ปรับเฉพาะรายงานเมื่อ HR อนุมัติ เก็บบันทึกสแกนจริงไว้เหมือนเดิม
            และไม่หักเวลาพักอัตโนมัติ
          </p>
          <GridTable
            heads={[
              "พนักงาน",
              "วันที่",
              "เวลาที่ขอ",
              "เหตุผล",
              "สถานะ",
              "พิจารณา",
            ]}
            rows={data.adjustments.map((a) => [
              s.employees.find((p) => p.id === a.employee_id)?.name ||
                a.employee_id,
              a.day,
              a.requested_in.slice(0, 5) +
                " ถึง " +
                a.requested_out.slice(0, 5),
              a.reason,
              statusNames[a.status] || a.status,
              <div key={a.id} className="actions">
                {a.status === "pending" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void send("adjustment-status", {
                        id: a.id,
                        status: "approved",
                      })
                    }
                  >
                    อนุมัติแก้เวลา
                  </button>
                )}
                {a.status !== "rejected" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void send("adjustment-status", {
                        id: a.id,
                        status: "rejected",
                      })
                    }
                  >
                    {a.status === "approved"
                      ? "ยกเลิกการอนุมัติ"
                      : "ไม่อนุมัติ"}
                  </button>
                )}
              </div>,
            ])}
          />
        </section>
        <section className="panel">
          <h2>รายการลาเดือนนี้</h2>
          <GridTable
            heads={["พนักงาน", "วันที่", "เหตุผล", "สถานะ", "พิจารณา"]}
            rows={leaves.map((l) => [
              s.employees.find((p) => p.id === l.employee_id)?.name ||
                l.employee_id,
              l.starts + " ถึง " + l.ends,
              l.reason,
              statusNames[l.status] || l.status,
              <div key={l.id} className="actions">
                {l.status === "pending" && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send("leave-status", {
                          id: l.id,
                          status: "approved",
                        })
                      }
                    >
                      อนุมัติ
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send("leave-status", {
                          id: l.id,
                          status: "rejected",
                        })
                      }
                    >
                      ไม่อนุมัติ
                    </button>
                  </>
                )}
              </div>,
            ])}
          />
        </section>
      </>
    );
  }
  if (page === "reviews") {
    const queued = data.events
      .filter((e) => ["denied", "error"].includes(e.status))
      .filter(
        (e) =>
          reviewFilter === "all" ||
          (reviewFilter === "pending"
            ? !data.reviews.some(
                (r) => r.event_id === e.id && r.decision !== "follow_up",
              )
            : data.reviews.some(
                (r) => r.event_id === e.id && r.decision !== "follow_up",
              )),
      );
    return (
      <>
        {message}
        <section className="panel">
          <h2>ตรวจสอบการเข้าออก</h2>
          <div className="hr-toolbar">
            <label>
              เดือน
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            <label>
              สถานะการตรวจ
              <select
                value={reviewFilter}
                onChange={(e) => setReviewFilter(e.target.value)}
              >
                <option value="pending">รอตรวจสอบ</option>
                <option value="reviewed">ตรวจแล้ว</option>
                <option value="all">ทั้งหมด</option>
              </select>
            </label>
          </div>
          <p>
            เฉพาะเหตุการณ์ปฏิเสธหรือประมวลผลไม่สำเร็จ ผลตรวจของ HR
            ไม่เปลี่ยนผลเดิมและไม่สั่งเปิดประตู
          </p>
          <GridTable
            heads={["เวลา", "พนักงาน", "ประตู", "เหตุผล", "จัดการ"]}
            rows={queued.map((e) => [
              stamp(e.created_at),
              s.employees.find((p) => p.id === e.employee_id)?.name ||
                "ไม่ระบุตัวตน",
              s.doors.find((d) => d.id === e.door_id)?.name || e.door_id,
              e.reason,
              <button key={e.id} onClick={() => setEventId(e.id)}>
                ตรวจสอบ
              </button>,
            ])}
          />
        </section>
        {event && (
          <section className="panel" aria-label="รายละเอียดเหตุการณ์">
            <h2>รายละเอียดเหตุการณ์</h2>
            <p>
              {stamp(event.created_at)} · {event.device_id} ·{" "}
              {methodNames[event.method || "face"]} · {event.reason}
            </p>
            <p className="note">ภาพจากกล้องแสดงมุมปัจจุบันของทางเข้า</p>
            <button onClick={() => setShowCamera((v) => !v)}>
              {showCamera ? "ปิดภาพล่าสุด" : "ดูภาพล่าสุดของเครื่อง"}
            </button>
            {showCamera && (
              <EntranceCameras
                devices={s.devices.filter((d) => d.id === event.device_id)}
                doors={s.doors}
              />
            )}
            <form
              className="live-form hr-space"
              key={event.id}
              onSubmit={(e) => {
                e.preventDefault();
                void send("review", {
                  ...fields(e),
                  source_key: "event:" + event.id,
                  event_id: event.id,
                });
              }}
            >
              <label>
                ผลตรวจสอบ
                <select
                  name="decision"
                  defaultValue={
                    data.reviews.find((r) => r.event_id === event.id)
                      ?.decision || "reviewed"
                  }
                >
                  <option value="reviewed">ตรวจสอบแล้ว</option>
                  <option value="false_alarm">แจ้งเตือนคลาดเคลื่อน</option>
                  <option value="follow_up">ต้องติดตามต่อ</option>
                </select>
              </label>
              <label>
                บันทึกของ HR
                <textarea
                  name="note"
                  defaultValue={
                    data.reviews.find((r) => r.event_id === event.id)?.note ||
                    ""
                  }
                  minLength={3}
                  maxLength={1000}
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                บันทึกผลตรวจสอบ
              </button>
            </form>
            {event.employee_id && (
              <button
                className="danger hr-space"
                disabled={busy}
                onClick={() => {
                  const p = s.employees.find((p) => p.id === event.employee_id);
                  if (
                    p &&
                    confirm("ระงับพนักงาน " + p.name + " ทุกวิธีเข้าออก?")
                  )
                    void send(
                      "employee-status",
                      { id: p.id, active: false },
                      "/api/admin/",
                    );
                }}
              >
                ระงับพนักงานทุกวิธี
              </button>
            )}
          </section>
        )}
      </>
    );
  }
  if (page === "alerts")
    return (
      <>
        {message}
        <section className="panel">
          <h2>แจ้งเตือน HR และ IT</h2>
          <p>
            ข้อมูลอัปเดตทุก 15 วินาทีขณะเปิดหน้าเว็บ ยังไม่ส่ง Push, LINE
            หรืออีเมลออกไป
          </p>
          <p className="note">
            ประตูเปิดค้างและกันงัดจะแจ้งเมื่อมีข้อมูลเซ็นเซอร์จริงเท่านั้น
            เครื่องที่ยังไม่ส่งค่าจะแสดงว่ายังไม่มีข้อมูล
          </p>
          <GridTable
            heads={["ระดับ", "รายการ", "รายละเอียด", "รับทราบ"]}
            rows={activeAlerts.map((a) => [
              a.level === "high" ? "สำคัญ" : "ควรตรวจสอบ",
              a.title,
              a.detail,
              <button
                key={a.key}
                disabled={busy}
                onClick={() => {
                  const note = prompt("บันทึกการรับทราบอย่างน้อย 3 ตัวอักษร");
                  if (note)
                    void send("review", {
                      source_key: a.key,
                      event_id: null,
                      decision: "reviewed",
                      note,
                    });
                }}
              >
                รับทราบและบันทึก
              </button>,
            ])}
          />
        </section>
        <section className="panel">
          <h2>ข้อมูลเซ็นเซอร์ที่ได้รับ</h2>
          <GridTable
            heads={["เครื่อง", "ประตู", "ฝาเครื่อง"]}
            rows={s.devices.map((d) => [
              d.name,
              d.door_open == null
                ? "ยังไม่มีข้อมูล"
                : d.door_open
                  ? "เปิด"
                  : "ปิด",
              d.tamper == null
                ? "ยังไม่มีข้อมูล"
                : d.tamper
                  ? "เปิดฝา"
                  : "ปกติ",
            ])}
          />
        </section>
      </>
    );
  if (page === "device-tools")
    return (
      <>
        {message}
        <section className="panel">
          <h2>ทิศทางเครื่องสำหรับเวลางาน</h2>
          <p>
            บันทึกเก่าที่ไม่ทราบทิศทางจะไม่ถูกแก้เป็นขาเข้าโดยอัตโนมัติ
            การเปลี่ยนค่านี้ใช้กับเหตุการณ์ใหม่
          </p>
          <GridTable
            heads={["เครื่อง", "ทิศทาง", "กำหนดทิศทาง"]}
            rows={s.devices.map((d) => [
              d.name,
              labelDirection(d.direction),
              <form
                key={d.id}
                className="actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send("direction", {
                    id: d.id,
                    direction: fields(e).direction,
                  });
                }}
              >
                <label className="sr-only" htmlFor={"direction-" + d.id}>
                  ทิศทาง {d.name}
                </label>
                <select
                  id={"direction-" + d.id}
                  name="direction"
                  defaultValue={d.direction || "unspecified"}
                >
                  <option value="unspecified">ยังไม่ระบุ</option>
                  <option value="in">ขาเข้า</option>
                  <option value="out">ขาออก</option>
                </select>
                <button disabled={busy || d.revoked}>บันทึกทิศทาง</button>
              </form>,
            ])}
          />
        </section>
        <section className="panel">
          <h2>Dynamic QR สำหรับประตู</h2>
          <p>
            รหัสอายุ 60 วินาที ใช้ได้ครั้งเดียว
            พนักงานสแกนด้วยกล้องมือถือแล้วล็อกอินเพื่อยืนยัน
            ผู้ดูแลเปิดหน้านี้แทนจอเครื่องได้ระหว่างเชื่อมฮาร์ดแวร์
          </p>
          <form
            className="live-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send("qr", fields(e));
            }}
          >
            <label>
              เครื่องประตู
              <select name="device_id">
                {s.devices
                  .filter((d) => !d.revoked)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <button disabled={busy || !s.devices.some((d) => !d.revoked)}>
              สร้าง QR ใหม่
            </button>
          </form>
          {qr && (
            <div className="hr-qr" role="status">
              <strong>
                {Math.max(
                  0,
                  Math.ceil((Date.parse(qr.expires_at) - now) / 1000),
                )}{" "}
                วินาที
              </strong>
              {Date.parse(qr.expires_at) > now ? (
                <>
                  <img src={qr.image} alt="Dynamic QR ของประตู" />
                  <a href={qr.url} target="_blank" rel="noreferrer">
                    เปิดหน้าพนักงานของรหัสนี้
                  </a>
                  <small>
                    มือถือและคอมพิวเตอร์ต้องอยู่เครือข่ายที่ติดต่อถึงกัน QR
                    เพียงอย่างเดียวไม่ยืนยันว่าผู้ใช้ยืนอยู่หน้าประตู
                  </small>
                </>
              ) : (
                <p>QR หมดอายุ กรุณาสร้างใหม่</p>
              )}
            </div>
          )}
        </section>
      </>
    );
  return null;
}
