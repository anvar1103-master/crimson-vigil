// Клавиатура и мышь → снимок ввода на кадр.
// Для сценариев используется тот же формат, но заполненный скриптом.

export function emptyInput() {
  return {
    forward: false, back: false, left: false, right: false,
    sprint: false, jump: false, crouch: false,
    fire: false, firePressed: false, aim: false,
    reload: false, interact: false, dash: false, grenade: false,
    weapon: 0, // 0 — без смены, 1/2 — слот, ±10 — колесо
    lookX: 0, lookY: 0,
  };
}

export class Input {
  constructor(element) {
    this.el = element;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDown = [false, false, false];
    this.mousePressed = [false, false, false];
    this.dx = 0; this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.sensitivity = 0.0022;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = [false, false, false]; });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 1) e.preventDefault();
      this.mouseDown[e.button] = true;
      this.mousePressed[e.button] = true;
    });
    addEventListener('mouseup', (e) => { this.mouseDown[e.button] = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Защита от редких гигантских скачков movementX в Chrome.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) { this.keys.clear(); this.mouseDown = [false, false, false]; }
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    if (this.disabled) return;
    const p = this.el.requestPointerLock?.({ unadjustedMovement: true });
    if (p?.catch) p.catch(() => this.el.requestPointerLock());
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  consume() {
    const k = this.keys, pr = this.pressed;
    const s = emptyInput();
    s.forward = k.has('KeyW') || k.has('ArrowUp');
    s.back = k.has('KeyS') || k.has('ArrowDown');
    s.left = k.has('KeyA') || k.has('ArrowLeft');
    s.right = k.has('KeyD') || k.has('ArrowRight');
    s.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    s.crouch = k.has('KeyC') || k.has('ControlLeft');
    s.jump = pr.has('Space');
    s.dash = pr.has('KeyQ') || pr.has('AltLeft');
    s.reload = pr.has('KeyR');
    s.interact = pr.has('KeyE') || pr.has('KeyF');
    s.grenade = pr.has('KeyG') || this.mousePressed[1];
    s.fire = this.mouseDown[0];
    s.firePressed = this.mousePressed[0];
    s.aim = this.mouseDown[2];
    if (pr.has('Digit1')) s.weapon = 1;
    else if (pr.has('Digit2')) s.weapon = 2;
    else if (pr.has('Digit3')) s.weapon = 3;
    else if (this.wheel) s.weapon = this.wheel > 0 ? 10 : -10;
    s.lookX = this.dx * this.sensitivity;
    s.lookY = this.dy * this.sensitivity * (this.invertY ? -1 : 1);
    s.keysPressed = new Set(pr);
    this.dx = this.dy = this.wheel = 0;
    pr.clear();
    this.mousePressed = [false, false, false];
    return s;
  }
}
