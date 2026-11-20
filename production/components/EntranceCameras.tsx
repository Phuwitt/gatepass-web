"use client";
import { useEffect, useRef, useState } from "react";
import type { LiveDevice, LiveDoor } from "../lib/live-types";
export default function EntranceCameras({
  devices,
  doors,
}: {
  devices: LiveDevice[];
  doors: LiveDoor[];
}) {
  const [selected, setSelected] = useState(""),
    [watching, setWatching] = useState(false),
    [frame, setFrame] = useState(""),
    [at, setAt] = useState(""),
    [status, setStatus] = useState("เลือกเครื่องแล้วกดเริ่มดูภาพ"),
    [error, setError] = useState("");
  const viewer = useRef("");
  const device = devices.find((d) => d.id === selected);
  const enabled = watching && !!device && !device.revoked;
  useEffect(() => {
    if (!viewer.current) viewer.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    setFrame("");
    setAt("");
    setError("");
    if (!enabled || !selected) return;
    let active = true,
      polling = false,
      url = "";
    const abort = new AbortController();
    const endpoint = "/api/admin/cameras/" + encodeURIComponent(selected);
    const lease = (watch: boolean) =>
      fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ viewer_id: viewer.current, watch }),
        ...(watch ? { signal: abort.signal } : { keepalive: true }),
      });
    setStatus("รอภาพจาก ESP32 · อาจใช้เวลาประมาณ 15 วินาที");
    async function poll() {
      if (polling || !active) return;
      polling = true;
      try {
        const r = await lease(true);
        if (!r.ok) throw Error((await r.json()).error || "เริ่มดูภาพไม่ได้");
        const img = await fetch(endpoint, {
          cache: "no-store",
          signal: abort.signal,
        });
        if (!active) return;
        if (img.status === 204) {
          if (url) URL.revokeObjectURL(url);
          url = "";
          setFrame("");
          setAt("");
          setStatus("ยังไม่มีภาพใหม่ · ตรวจกล้องและเฟิร์มแวร์ที่บอร์ด");
          return;
        }
        if (!img.ok) throw Error((await img.json()).error || "โหลดภาพไม่ได้");
        const blob = await img.blob();
        if (!active) return;
        const next = URL.createObjectURL(blob);
        if (url) URL.revokeObjectURL(url);
        url = next;
        setFrame(next);
        setAt(img.headers.get("x-frame-time") || "");
        setStatus("ภาพล่าสุดจาก ESP32 · อัปเดตเป็นช่วง");
        setError("");
      } catch (e) {
        if (active) {
          if (url) URL.revokeObjectURL(url);
          url = "";
          setFrame("");
          setError(e instanceof Error ? e.message : "ติดต่อกล้องไม่ได้");
        }
      } finally {
        polling = false;
      }
    }
    void poll();
    const timer = setInterval(poll, 2000);
    function hidden() {
      if (document.hidden) setWatching(false);
    }
    document.addEventListener("visibilitychange", hidden);
    return () => {
      active = false;
      clearInterval(timer);
      abort.abort();
      document.removeEventListener("visibilitychange", hidden);
      if (url) URL.revokeObjectURL(url);
      void lease(false).catch(() => {});
    };
  }, [selected, enabled]);
  return (
    <>
      <section className="panel">
        <h2>กล้องทุกทางเข้า</h2>
        <p>
          เลือกเครื่องเพื่อดูภาพบริเวณทางเข้า กล้องส่งภาพเฉพาะตอนเปิดดู
        </p>
        <label>
          เลือกทางเข้า / กล้อง
          <select
            value={selected}
            onChange={(e) => {
              setWatching(false);
              setSelected(e.target.value);
            }}
          >
            <option value="">เลือกเครื่อง</option>
            {devices
              .filter((d) => !d.revoked)
              .map((d) => (
                <option value={d.id} key={d.id}>
                  {doors.find((x) => x.id === d.door_id)?.name || "ประตู"} ·{" "}
                  {d.name} ({d.id})
                </option>
              ))}
          </select>
        </label>
        <div className="actions camera-actions">
          <button
            className="primary"
            disabled={!device || device.revoked || watching}
            onClick={() => setWatching(true)}
          >
            เริ่มดูภาพ
          </button>
          <button
            disabled={!watching}
            onClick={() => {
              setWatching(false);
              setStatus("หยุดดูแล้ว");
            }}
          >
            หยุดดูภาพ
          </button>
        </div>
        {!devices.some((d) => !d.revoked) && (
          <p className="note">เพิ่มเครื่องที่หน้าโซนและอุปกรณ์ก่อน</p>
        )}
        <div className="entrance-preview">
          {enabled && frame ? (
            <img src={frame} alt={"ภาพจาก ESP32 " + device?.name} />
          ) : (
            <p>{enabled ? status : "ยังไม่ได้เปิดดูภาพ"}</p>
          )}
        </div>
        <p role="status">
          {enabled ? status : "หยุดดูภาพ"}
          {enabled &&
            at &&
            " · ได้รับเมื่อ " + new Date(at).toLocaleTimeString("th-TH")}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="note">
          ภาพเก็บชั่วคราวในหน่วยความจำ ไม่บันทึกวิดีโอหรือภาพประวัติ
          ปิดหน้าหรือซ่อนแท็บจะหยุดขอพรีวิว เฟิร์มแวร์ 0.3
          แสดงภาพได้ตามรอบสแกนประมาณ 6 วินาที; รุ่น 0.4 เพิ่มพรีวิวประมาณทุก 2
          วินาทีขณะเปิดดู เวลาจริงขึ้นกับเครือข่ายและการประมวลผล
        </p>
      </section>
      <section className="panel">
        <h2>ใช้ไฟเลี้ยงตลอดได้ไหม</h2>
        <p>
          รุ่นนี้เสียบไฟใช้งานต่อเนื่องได้โดยต้องทดสอบแหล่งจ่ายและความร้อนของชุดจริง
          การเปิดดูเพิ่มภาระถ่ายภาพและส่ง Wi-Fi จึงใช้ไฟเพิ่ม
          แต่ยังระบุกระแสที่เพิ่มไม่ได้จนกว่าจะวัด
        </p>
        <p>
          ตัวอย่างเท่านั้น: ถ้าวัดทั้งชุดได้เฉลี่ย 400 mA ที่ 5 V จะใช้ประมาณ 2
          W หรือ 0.048 kWh ต่อวัน ไม่รวมคอมพิวเตอร์ เราเตอร์ และกลอน
          ถ้าไม่มีแบตหรือ UPS เมื่อไฟดับบอร์ดจะดับด้วย
        </p>
      </section>
    </>
  );
}
