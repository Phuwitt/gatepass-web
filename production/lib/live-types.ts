export type Person = {
  id: string;
  name: string;
  email: string;
  department: string;
  job_title?: string;
  active: boolean;
  face_enabled: boolean;
  phone?: string;
  hired_on?: string | null;
  work_start?: string;
  work_end?: string;
  grace_minutes?: number;
  auth_user_id?: string | null;
};
export type Zone = { id: string; name: string };
export type LiveDoor = { id: string; name: string; zone_id: string };
export type LiveDevice = {
  id: string;
  name: string;
  door_id: string;
  revoked: boolean;
  last_seen: string | null;
  firmware: string | null;
  camera_ready?: boolean | null;
  card_reader_ready?: boolean | null;
  rssi: number | null;
  direction?: "in" | "out" | "unspecified";
  door_open?: boolean | null;
  door_open_since?: string | null;
  tamper?: boolean | null;
  tamper_since?: string | null;
};
export type Permission = {
  employee_id: string;
  door_id: string;
  starts: string;
  ends: string;
};
export type LiveEvent = {
  id: string;
  request_id: string;
  employee_id: string | null;
  device_id: string;
  door_id: string;
  status: string;
  reason: string;
  similarity: number | null;
  created_at: string;
  method?: "face" | "card" | "nfc" | "qr";
  direction?: "in" | "out" | "unspecified";
};
export type Method = {
  employee_id: string;
  method: "card" | "nfc" | "qr";
  enabled: boolean;
};
export type Credential = {
  id: string;
  employee_id: string;
  method: "card" | "nfc";
  label: string;
  last_four: string;
  revoked: boolean;
  created_at: string;
};
export type Leave = {
  id: string;
  employee_id: string;
  starts: string;
  ends: string;
  kind: string;
  reason: string;
  status: string;
  created_at: string;
};
export type Review = {
  source_key: string;
  event_id: string | null;
  decision: string;
  note: string;
  created_at: string;
};
export type Adjustment = {
  id: string;
  employee_id: string;
  day: string;
  requested_in: string;
  requested_out: string;
  reason: string;
  status: string;
  created_at: string;
};
export type Workspace = {
  user: { id: string; email: string; role: string };
  employees: Person[];
  zones: Zone[];
  doors: LiveDoor[];
  devices: LiveDevice[];
  permissions: Permission[];
  events: LiveEvent[];
  methods?: Method[];
  credentials?: Credential[];
  leaves?: Leave[];
  reviews?: Review[];
  audit: {
    id: number;
    action: string;
    details: Record<string, unknown>;
    created_at: string;
  }[];
};
