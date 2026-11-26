/*
 * wallpanel-motion.js - camera motion detection for lovelace-wallpanel,
 * working in the Android WebView of the Home Assistant Companion app
 * (visible video element instead of display:none).
 * Dashboard resource: /local/wallpanel-motion.js?v=1  (type: module)
 * https://github.com/mezoo/wallpanel-motion - MIT License
 */
const CFG = {
  users: ['hallway-tab'],          // HA users (display name) the module runs for
  facingMode: 'user',              // 'user' = front camera, 'environment' = rear camera
  width: 64, height: 48,           // analysis resolution
  intervalMs: 250,                 // analysis interval
  pixelDelta: 25,                  // luminance delta (0-255) for a pixel to count as changed
  motionRatio: 0.03,               // share of changed pixels that means motion (3 %)
  framesRequired: 2,               // consecutive frames above the threshold
  entity: 'input_boolean.tablet_movment', // '' to disable
  entityOffDelayMs: 10000,         // turn the entity off after 10 s without motion
  debug: false,                    // camera preview + live metrics in the bottom-right corner
};

const LOG = (...a) => console.info('[wallpanel-motion]', ...a);

function getHass() {
  const ha = document.querySelector('home-assistant');
  return ha && ha.hass;
}

function findDeep(root, selector, depth = 0) {
  if (!root || depth > 12) return null;
  const hit = root.querySelector && root.querySelector(selector);
  if (hit) return hit;
  const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const el of all) {
    if (el.shadowRoot) {
      const r = findDeep(el.shadowRoot, selector, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

let wpView = null;
function wallpanel() {
  if (wpView && wpView.isConnected) return wpView;
  wpView = findDeep(document, 'wallpanel-view');
  return wpView;
}

class Motion {
  constructor() {
    this.prev = null;
    this.hits = 0;
    this.entityOn = false;
    this.offTimer = null;
    this.timer = null;
    this.stream = null;
  }

  buildDom() {
    const v = document.createElement('video');
    v.autoplay = true; v.muted = true; v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.width = CFG.width; v.height = CFG.height;
    // Must stay visible (not display:none), otherwise Android WebView delivers black frames.
    Object.assign(v.style, {
      position: 'fixed', right: '0', bottom: '0', zIndex: '2147483647',
      pointerEvents: 'none',
      width: CFG.debug ? '192px' : '2px', height: CFG.debug ? '144px' : '2px',
      opacity: CFG.debug ? '1' : '0.01',
      transform: 'scaleX(-1)', background: '#000',
    });
    document.body.appendChild(v);
    this.video = v;

    const c = document.createElement('canvas');
    c.width = CFG.width; c.height = CFG.height;
    this.ctx = c.getContext('2d', { willReadFrequently: true });

    if (CFG.debug) {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'fixed', right: '0', bottom: '144px', zIndex: '2147483647',
        pointerEvents: 'none', background: 'rgba(0,0,0,.7)', color: '#0f0',
        font: '14px monospace', padding: '4px 6px', width: '180px',
      });
      document.body.appendChild(d);
      this.dbg = d;
    }
  }

  async start() {
    this.buildDom();
    // The screensaver slideshow may pause our video: resume it.
    this.video.addEventListener('pause', () => { this.video.play().catch(() => {}); });
    this.restarts = 0;
    this.dark = 0;
    await this.openCamera();
    this.timer = setInterval(() => this.tick(), CFG.intervalMs);
  }

  async openCamera() {
    if (this.opening) return;
    this.opening = true;
    try {
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: CFG.facingMode }, width: { ideal: 320 }, height: { ideal: 240 } },
      });
      this.video.srcObject = this.stream;
      await this.video.play().catch(e => LOG('play()', e));
      this.prev = null;
      this.dark = 0;
      LOG('camera started');
    } catch (e) {
      LOG('camera error', e);
      if (this.dbg) this.dbg.textContent = 'Camera: ' + e.name;
    } finally {
      this.opening = false;
    }
  }

  restart(reason) {
    this.restarts++;
    LOG('restarting camera:', reason);
    this.openCamera();
  }

  tick() {
    if (this.opening) return;
    const track = this.stream && this.stream.getVideoTracks()[0];
    if (!track || track.readyState === 'ended') { this.restart('stream ended'); return; }
    if (this.video.paused) this.video.play().catch(() => {});
    if (this.video.readyState < 2) { if (this.dbg) this.dbg.textContent = 'waiting for video...'; return; }
    this.ctx.drawImage(this.video, 0, 0, CFG.width, CFG.height);
    const px = this.ctx.getImageData(0, 0, CFG.width, CFG.height).data;
    const n = CFG.width * CFG.height;
    const gray = new Uint8Array(n);
    let sum = 0;
    for (let i = 0, j = 0; j < n; i += 4, j++) {
      const g = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
      gray[j] = g; sum += g;
    }
    // Black image for ~2 s: frozen stream, reopen the camera.
    this.dark = sum / n < 2 ? this.dark + 1 : 0;
    if (this.dark >= Math.ceil(2000 / CFG.intervalMs)) { this.restart('black image'); return; }
    let changed = 0;
    if (this.prev) {
      for (let j = 0; j < n; j++) if (Math.abs(gray[j] - this.prev[j]) > CFG.pixelDelta) changed++;
    }
    this.prev = gray;
    const ratio = changed / n;
    this.hits = ratio >= CFG.motionRatio ? this.hits + 1 : 0;
    const motion = this.hits >= CFG.framesRequired;

    if (this.dbg) {
      this.dbg.textContent =
        `lum ${(sum / n).toFixed(0)}  chg ${(ratio * 100).toFixed(1)}%  r${this.restarts}` +
        (track.muted ? ' muted' : '') + (motion ? '  MOTION' : '');
    }
    if (motion) this.onMotion();
  }

  onMotion() {
    const wp = wallpanel();
    if (wp) {
      wp.idleSince = Date.now(); // keep the screensaver from starting while there is motion
      try {
        if (wp.screensaverRunning && wp.screensaverRunning()) {
          LOG('motion -> stopping screensaver');
          wp.stopScreensaver(1);
        }
      } catch (e) { LOG('stopScreensaver', e); }
    }
    this.setEntity(true);
    clearTimeout(this.offTimer);
    this.offTimer = setTimeout(() => this.setEntity(false), CFG.entityOffDelayMs);
  }

  setEntity(on) {
    if (!CFG.entity || this.entityOn === on) return;
    const hass = getHass();
    if (!hass || !hass.states[CFG.entity]) return;
    this.entityOn = on;
    hass.callService('input_boolean', on ? 'turn_on' : 'turn_off', { entity_id: CFG.entity })
      .catch(e => LOG('entity', e));
  }
}

(function boot(tries = 0) {
  const hass = getHass();
  if (!hass || !hass.user) { if (tries < 120) setTimeout(() => boot(tries + 1), 500); return; }
  if (!CFG.users.includes(hass.user.name)) { LOG('inactive for user', hass.user.name); return; }
  if (window.__wallpanelMotion) return;
  window.__wallpanelMotion = new Motion();
  window.__wallpanelMotion.start();
})();
