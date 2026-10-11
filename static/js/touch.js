// On-screen touch controls: a floating joystick on the left half, drag-to-look
// and pinch-to-zoom on the right half, plus a button. They feed the shared input.
// While `ui.stickEnabled()` is false (the editor overview), every drag looks around.

import { stickVector } from "./input.js";

const STICK_RADIUS = 56;        // pixels the knob can travel
const LOOK_SCALE = 2.2;         // touch drag pixels -> mouse-look pixels
const STICK_AREA = 0.45;        // left share of the screen that starts the joystick

export function isTouchDevice() {
  return window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

// Returns { enabled } and calls onEnable once when touch controls first switch on.
export function createTouchControls(canvas, input, ui, onEnable) {
  const state = { enabled: false };
  const enable = () => {
    if (state.enabled) return;
    state.enabled = true;
    document.body.classList.add("touch");
    onEnable?.();
  };
  if (isTouchDevice()) enable();

  let stickId = null, stickOrigin = null;
  const lookers = new Map(); // pointerId -> last {x, y}
  let pinchDistance = null;

  const showStick = (x, y, knobX, knobY) => {
    ui.stick.hidden = false;
    ui.stick.style.left = `${x}px`;
    ui.stick.style.top = `${y}px`;
    ui.knob.style.transform = `translate(${knobX}px, ${knobY}px)`;
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    enable();
    canvas.setPointerCapture(e.pointerId);
    if (stickId === null && ui.stickEnabled() && e.clientX < window.innerWidth * STICK_AREA) {
      stickId = e.pointerId;
      stickOrigin = { x: e.clientX, y: e.clientY };
      showStick(e.clientX, e.clientY, 0, 0);
    } else {
      lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pinchDistance = null;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch") return;
    if (e.pointerId === stickId) {
      let dx = e.clientX - stickOrigin.x, dy = e.clientY - stickOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx *= STICK_RADIUS / len;
        dy *= STICK_RADIUS / len;
      }
      showStick(stickOrigin.x, stickOrigin.y, dx, dy);
      const v = stickVector(dx, dy, STICK_RADIUS);
      input.setStick(v.x, v.y);
      return;
    }
    const last = lookers.get(e.pointerId);
    if (!last) return;
    lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (lookers.size >= 2) {
      // Two fingers: pinch to zoom (spreading fingers brings the camera closer).
      const [a, b] = [...lookers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance) input.addZoom(pinchDistance / distance);
      pinchDistance = distance;
    } else {
      input.addLook((e.clientX - last.x) * LOOK_SCALE, (e.clientY - last.y) * LOOK_SCALE);
    }
  });

  const release = (e) => {
    if (e.pointerId === stickId) {
      stickId = null;
      input.setStick(0, 0);
      ui.stick.hidden = true;
    }
    lookers.delete(e.pointerId);
    pinchDistance = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  // Hold button -> key held while touched.
  const holdTime = (held) => (e) => {
    e.preventDefault();
    input.hold("KeyT", held);
    ui.time.classList.toggle("active", held);
  };
  ui.time.addEventListener("pointerdown", holdTime(true));
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) ui.time.addEventListener(type, holdTime(false));

  return state;
}
