// Player input from keyboard + mouse and from touch controls, merged into
// one set of queries the game reads each frame.

const CAPTURED_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

// `capturesMouse()` decides whether a click captures the pointer for mouse look (when
// walking around) or the mouse just drags the view (in the editor overview).
export function createInput(canvas, { capturesMouse = () => true } = {}) {
  const down = new Set();     // physical keys held
  const virtual = new Set();  // on-screen buttons held (same key codes)
  const pressed = new Set();  // keys pressed since last checked
  let lookX = 0, lookY = 0;   // mouse pixels, or touch pixels already scaled to match
  let zoom = 1;               // pinch zoom factor since last checked
  let wheel = 0;
  let stick = { x: 0, y: 0 }; // touch joystick, -1..1 (y up = forward)

  window.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, select, textarea")) return; // typing in a form, not playing
    down.add(e.code);
    if (!e.repeat) pressed.add(e.code);
    if (CAPTURED_KEYS.has(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => down.delete(e.code));
  window.addEventListener("blur", () => {
    down.clear();
    virtual.clear();
  });

  // Mouse: click captures the pointer for mouse look, or drag to look (touch taps must not try this).
  let dragging = false;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    if (capturesMouse()) canvas.requestPointerLock?.();
    else dragging = true;
  });
  window.addEventListener("pointerup", () => { dragging = false; });
  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas && !(dragging && e.buttons)) return;
    lookX += e.movementX;
    lookY += e.movementY;
  });
  canvas.addEventListener("wheel", (e) => {
    wheel += Math.sign(e.deltaY);
    e.preventDefault();
  }, { passive: false });

  const isDown = (code) => down.has(code) || virtual.has(code);

  return {
    isDown,
    // True once per key press.
    wasPressed: (code) => pressed.delete(code),

    // Movement intent in the camera frame: ahead (+forward) and strafe (+right), length <= 1.
    moveVector() {
      const keys = {
        strafe: (isDown("KeyD") ? 1 : 0) - (isDown("KeyA") ? 1 : 0),
        ahead: (isDown("KeyW") ? 1 : 0) - (isDown("KeyS") ? 1 : 0),
      };
      return combineMove(keys, stick);
    },
    // Look movement in mouse pixels since the last call.
    takeLookDelta() {
      const delta = { x: lookX, y: lookY };
      lookX = lookY = 0;
      return delta;
    },
    // Camera distance multiplier since the last call, from wheel notches and pinches.
    takeZoom(stepPerNotch) {
      const factor = stepPerNotch ** wheel * zoom;
      wheel = 0;
      zoom = 1;
      return factor;
    },

    // Hooks for the touch controls.
    setStick(x, y) { stick = { x, y }; },
    addLook(dx, dy) { lookX += dx; lookY += dy; },
    addZoom(factor) { zoom *= factor; },
    press(code) { pressed.add(code); },
    hold(code, isHeld) { if (isHeld) virtual.add(code); else virtual.delete(code); },
  };
}

// Keyboard wins when used; otherwise the analog stick. Never longer than 1.
export function combineMove(keys, stick) {
  let strafe = keys.strafe, ahead = keys.ahead;
  if (strafe === 0 && ahead === 0) {
    strafe = stick.x;
    ahead = stick.y;
  }
  const len = Math.hypot(strafe, ahead);
  return len > 1 ? { strafe: strafe / len, ahead: ahead / len } : { strafe, ahead };
}

// Joystick knob offset (pixels, screen y down) to a -1..1 vector with y up.
// Inside the dead zone it reads zero; beyond it the response ramps from 0 to 1.
export function stickVector(dx, dy, radius, deadZone = 0.15) {
  const len = Math.hypot(dx, dy);
  const amount = Math.min(len / radius, 1);
  if (amount <= deadZone || len === 0) return { x: 0, y: 0 };
  const scaled = (amount - deadZone) / (1 - deadZone);
  return { x: (dx / len) * scaled, y: (-dy / len) * scaled };
}
