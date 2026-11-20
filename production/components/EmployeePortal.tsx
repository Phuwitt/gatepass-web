"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Adjustment, Leave, LiveEvent, Person } from "../lib/live-types";
import { methodNames, statusNames } from "../lib/hr";
type State = {
  person: Person;
  events: LiveEvent[];
  permissions: {
    door_id: string;
    starts: string;
    ends: string;
    gp_doors: { name: string };
  }[];
  methods: { method: string; enabled: boolean }[];
  leaves: Leave[];
  adjustments: Adjustment[];
};
export default function EmployeePortal({
  logout,
}: {
  logout: () => Promise<void>;
}) {
  const [data, setData] = useState<State | null>(null),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/employee/workspace", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านข้อมูลไม่ได้");
    }
  }, []);
  useEffect(() => {
    const u = new URL(window.location.href);
    setToken(u.searchParams.get("qr") || "");
    if (u.searchParams.has("qr")) {
      u.searchParams.delete("qr");
      window.history.replaceState(null, "", u);
    }
    void load();
  }, [load]);
  async function send(resource: string, value: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/employee/" + resource, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setNotice(
        resource === "adjustment"
          ? "ส่งคำขอแก้เวลาแล้ว"
          : resource === "qr"
            ? `${d.allowed ? "อนุญาต" : "ปฏิเสธ"} · ${d.reason} · ยังไม่สั่งกลอนจริง`
            : "ส่งคำขอลาแล้ว",
      );
      if (resource === "qr") setToken("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดำเนินการไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  function leave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send("leave", Object.fromEntries(new FormData(e.currentTarget)));
  }
  return (
    <main className="employee-portal">
      <header className="topbar">
        <strong>GATEPASS · พนักงาน</strong>
        <button onClick={logout}>ออกจากระบบ</button>
      </header>
      <div className="content">
        <h1>{data?.person.name || "ข้อมูลพนักงาน"}</h1>
        <p>ข้อมูลเฉพาะของคุณ · {data?.person.id}</p>
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
        <section className="panel">
          <h2>ยืนยันการเข้าประตูด้วย QR</h2>
          <p>
            สแกน QR ที่เครื่องด้วยกล้องมือถือ แล้วเปิดลิงก์ในเว็บนี้
            รหัสต้องยังไม่หมดอายุและมีสิทธิ์เข้าประตู
          </p>
          {token ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void send("qr", { token })}
            >
              ยืนยัน QR ที่สแกน
            </button>
          ) : (
            <p>ยังไม่มี QR ที่สแกน กรุณาสแกนรหัสใหม่ที่ประตู</p>
          )}
          <small>
            รอบนี้ยังไม่มีการสั่งกลอนจริง ไม่ใช้ QR
            เป็นหลักฐานว่าคุณอยู่หน้าประตู
          </small>
        </section>
        {data && (
          <>
            <section className="panel">
              <h2>สิทธิ์และเวลางานของฉัน</h2>
              <p>
                เวลางาน {data.person.work_start?.slice(0, 5)} ถึง{" "}
                {data.person.work_end?.slice(0, 5)}
              </p>
              <p>
                วิธีที่ได้รับอนุญาต:{" "}
                {data.methods
                  .filter((m) => m.enabled)
                  .map((m) => methodNames[m.method])
                  .join(", ") || "ยังไม่มีวิธีเพิ่มเติม"}
              </p>
              {data.permissions.map((p) => (
                <p key={p.door_id}>
                  {p.gp_doors?.name} · {p.starts.slice(0, 5)} ถึง{" "}
                  {p.ends.slice(0, 5)}
                </p>
              ))}
            </section>
            <section className="panel">
              <h2>บันทึกเข้าออกของฉัน</h2>
              <p>แสดงล่าสุดสูงสุด 200 รายการ</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>เวลา</th>
                      <th>วิธี</th>
                      <th>ผล</th>
                      <th>เหตุผล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {new Date(e.created_at).toLocaleString("th-TH", {
                            timeZone: "Asia/Bangkok",
                          })}
                        </td>
                        <td>{methodNames[e.method || "face"]}</td>
                        <td>{statusNames[e.status] || e.status}</td>
                        <td>{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.events.length && <p className="empty">ยังไม่มีบันทึก</p>}
              </div>
            </section>
            <section className="panel">
              <h2>ขอแก้เวลางาน</h2>
              <p>
                กรณีลืมสแกนหรือบันทึกเวลาไม่ครบ ต้องให้ HR อนุมัติก่อนนำไปสรุป
              </p>
              <form
                className="live-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(
                    "adjustment",
                    Object.fromEntries(new FormData(e.currentTarget)),
                  );
                }}
              >
                <label>
                  วันที่
                  <input name="day" type="date" required />
                </label>
                <div className="form-grid">
                  <label>
                    เวลาเข้า
                    <input name="requested_in" type="time" required />
                  </label>
                  <label>
                    เวลาออก
                    <input name="requested_out" type="time" required />
                  </label>
                </div>
                <label>
                  เหตุผลการแก้เวลา
                  <textarea
                    name="reason"
                    minLength={3}
                    maxLength={1000}
                    required
                  />
                </label>
                <button disabled={busy}>ส่งคำขอแก้เวลา</button>
              </form>
              <h3 className="hr-space">คำขอแก้เวลาของฉัน</h3>
              {data.adjustments.map((a) => (
                <p key={a.id}>
                  {a.day} · {a.requested_in.slice(0, 5)} ถึง{" "}
                  {a.requested_out.slice(0, 5)} ·{" "}
                  {statusNames[a.status] || a.status}
                </p>
              ))}
            </section>
            <section className="panel">
              <h2>ส่งคำขอลา</h2>
              <form className="live-form" onSubmit={leave}>
                <label>
                  ประเภท
                  <select name="kind">
                    <option value="sick">ลาป่วย</option>
                    <option value="personal">ลากิจ</option>
                    <option value="annual">ลาพักร้อน</option>
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    เริ่ม
                    <input name="starts" type="date" required />
                  </label>
                  <label>
                    สิ้นสุด
                    <input name="ends" type="date" required />
                  </label>
                </div>
                <label>
                  เหตุผล
                  <textarea
                    name="reason"
                    minLength={3}
                    maxLength={1000}
                    required
                  />
                </label>
                <button disabled={busy}>ส่งคำขอให้ HR</button>
              </form>
              <h3 className="hr-space">คำขอของฉัน</h3>
              {data.leaves.map((l) => (
                <p key={l.id}>
                  {l.starts} ถึง {l.ends} · {statusNames[l.status] || l.status}{" "}
                  · {l.reason}
                </p>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
