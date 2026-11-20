"use client";
import { useEffect, useRef, useState } from "react";
export default function FaceCapture({
  employee,
  onSaved,
}: {
  employee: string;
  onSaved: () => void;
}) {
  const request = useRef(0);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null);
  const [image, setImage] = useState<Blob | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [camera, setCamera] = useState(false),
    [opening, setOpening] = useState(false),
    [cameras, setCameras] = useState<MediaDeviceInfo[]>([]),
    [selectedCamera, setSelectedCamera] = useState("");
  const stop = () => {
    request.current++;
    setOpening(false);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false);
  };
  useEffect(
    () => () => {
      request.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;
    let active = true;
    async function update() {
      try {
        const list = (await media.enumerateDevices()).filter(
          (d) => d.kind === "videoinput" && d.deviceId,
        );
        if (!active) return;
        setCameras(list);
        let stored = "";
        try {
          stored = localStorage.getItem("gatepass-camera") || "";
        } catch {}
        setSelectedCamera((old) =>
          list.some((d) => d.deviceId === old)
            ? old
            : list.find((d) => d.deviceId === stored)?.deviceId ||
              list.find((d) => /facetime|macbook|built.in/i.test(d.label))
                ?.deviceId ||
              list.find((d) => !/obs|virtual/i.test(d.label))?.deviceId ||
              list[0]?.deviceId ||
              "",
        );
      } catch {}
    }
    void update();
    media.addEventListener("devicechange", update);
    return () => {
      active = false;
      media.removeEventListener("devicechange", update);
    };
  }, []);
  useEffect(() => {
    setImage(null);
    setError("");
  }, [employee]);
  useEffect(() => {
    if (!image) {
      setPreview("");
      return;
    }
    const u = URL.createObjectURL(image);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);
  async function start() {
    setError("");
    setOpening(true);
    const current = ++request.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("เปิดเว็บผ่าน localhost หรือ HTTPS เพื่อใช้กล้อง");
      const next = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          ...(selectedCamera ? { deviceId: { exact: selectedCamera } } : {}),
        },
        audio: false,
      });
      if (current !== request.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = next;
      setCamera(true);
      const actual = next.getVideoTracks()[0]?.getSettings().deviceId;
      if (actual) {
        setSelectedCamera(actual);
        try {
          localStorage.setItem("gatepass-camera", actual);
        } catch {}
      }
      try {
        const list = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "videoinput" && d.deviceId,
        );
        if (current === request.current) setCameras(list);
      } catch {}
      if (current !== request.current) return;
      if (video.current) {
        video.current.srcObject = next;
        await video.current.play();
      }
    } catch (e) {
      if (current !== request.current) return;
      stop();
      const name = e instanceof Error ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "ยังไม่ได้อนุญาตกล้อง เปิดสิทธิ์กล้องให้เบราว์เซอร์หรือ Codex แล้วลองใหม่"
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "ไม่พบกล้องที่เลือก ลองเลือกกล้องอื่นแล้วเปิดใหม่"
            : e instanceof Error
              ? e.message
              : "เปิดกล้องไม่ได้",
      );
    } finally {
      if (current === request.current) setOpening(false);
    }
  }
  function capture() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob(
      (b) => {
        setImage(b);
        stop();
      },
      "image/jpeg",
      0.9,
    );
  }
  async function save() {
    if (!image) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/face?employee=${encodeURIComponent(employee)}`,
        {
          method: "POST",
          headers: { "content-type": "image/jpeg" },
          body: image,
        },
      );
      const d = await res.json();
      if (!res.ok) throw Error(d.error);
      setImage(null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="face-capture">
      <h3>ลงทะเบียนใบหน้า</h3>
      <p>ถ่ายด้านหน้าทีละคนในที่สว่าง ระบบจะตรวจภาพก่อนบันทึก</p>
      <label>
        เลือกกล้อง
        <select
          value={selectedCamera}
          disabled={busy || opening}
          onChange={(e) => {
            stop();
            setSelectedCamera(e.target.value);
            setImage(null);
            setError("");
          }}
        >
          {!cameras.length && (
            <option value="">เปิดกล้องเพื่ออนุญาตและแสดงรายชื่อ</option>
          )}
          {cameras.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `กล้อง ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      <small>
        เลือก FaceTime HD Camera หรือกล้องของ Mac หากภาพเดิมเป็น OBS
        เปลี่ยนกล้องแล้วกดเปิดกล้องอีกครั้ง
      </small>
      <div className="actions">
        <button
          type="button"
          onClick={start}
          disabled={camera || busy || opening}
        >
          {opening ? "กำลังเปิดกล้อง…" : "เปิดกล้องคอมพิวเตอร์"}
        </button>
        {camera && (
          <>
            <button type="button" onClick={capture}>
              ถ่ายภาพ
            </button>
            <button type="button" onClick={stop}>
              ปิดกล้อง
            </button>
          </>
        )}
      </div>
      <video
        ref={video}
        hidden={!camera}
        muted
        playsInline
        aria-label="ภาพจากกล้อง"
      />
      <label>
        หรือเลือกภาพ JPEG
        <input
          type="file"
          accept="image/jpeg"
          disabled={busy}
          onChange={(e) => {
            setError("");
            const f = e.target.files?.[0];
            if (f) {
              if (f.size > 2097152) return setError("ภาพต้องไม่เกิน 2 MB");
              setImage(f);
            }
          }}
        />
      </label>
      {preview && <img src={preview} alt="ภาพใบหน้าที่เลือกลงทะเบียน" />}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={!employee || !image || busy}
        onClick={save}
      >
        {busy ? "กำลังตรวจและบันทึก…" : "ตรวจและบันทึกใบหน้า"}
      </button>
    </div>
  );
}
