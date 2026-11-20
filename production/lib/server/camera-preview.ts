import "server-only";
// Single-process local bench: latest frame only, never a recording or public URL.
type Frame = { bytes: Buffer; at: number };
type State = {
  viewers: Map<string, { device: string; until: number }>;
  frames: Map<string, Frame>;
};
const root = globalThis as typeof globalThis & { __gatepassPreview?: State };
const state = (root.__gatepassPreview ??= {
  viewers: new Map(),
  frames: new Map(),
});
function prune() {
  const now = Date.now();
  for (const [id, v] of state.viewers)
    if (v.until <= now) state.viewers.delete(id);
  for (const [id, f] of state.frames)
    if (
      now - f.at > 10000 ||
      ![...state.viewers.values()].some((v) => v.device === id)
    )
      state.frames.delete(id);
}
export function watch(viewer: string, device: string, enabled: boolean) {
  prune();
  if (enabled) {
    if (state.viewers.size >= 128 && !state.viewers.has(viewer))
      throw Error("Too many preview viewers");
    state.viewers.set(viewer, { device, until: Date.now() + 20000 });
  } else if (state.viewers.get(viewer)?.device === device)
    state.viewers.delete(viewer);
  prune();
}
export function previewWanted(device: string) {
  prune();
  return [...state.viewers.values()].some((v) => v.device === device);
}
export function putPreview(device: string, bytes: Buffer) {
  if (previewWanted(device) && bytes.length <= 524288)
    state.frames.set(device, { bytes, at: Date.now() });
}
export function getPreview(device: string) {
  prune();
  return state.frames.get(device);
}

const timerRoot = globalThis as typeof globalThis & {
  __gatepassPreviewTimer?: ReturnType<typeof setInterval>;
};
if (!timerRoot.__gatepassPreviewTimer) {
  timerRoot.__gatepassPreviewTimer = setInterval(prune, 5000);
  timerRoot.__gatepassPreviewTimer.unref();
}
