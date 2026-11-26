# wallpanel-motion

Camera motion detection for [lovelace-wallpanel](https://github.com/j-a-n/lovelace-wallpanel) that works inside the **Home Assistant Android Companion app** (Android WebView).

## Try wallpanel's built-in detection first

Wallpanel already includes camera motion detection (`camera_motion_detection_enabled`), and it may work in the Companion app with the right settings:

- Home Assistant must be served over **HTTPS** (camera access requires a secure context).
- In the Companion app, enable **Settings → Companion app → Autoplay videos**. Without it, the WebView refuses to start the camera video without a user gesture (`Playback() can only be started by a user gesture`) and wallpanel only gets black frames. See [wallpanel#550](https://github.com/j-a-n/lovelace-wallpanel/issues/550).

If the built-in detection works for you, you do not need this module.

## Why this module exists

On our test tablet (with autoplay disabled), wallpanel's built-in detection did not work in the Companion app WebView:

1. Wallpanel reads the camera through a hidden `<video>` element (`display: none`) and starts it without a user gesture. The frames it received were **black**, so no motion was ever detected (visible with `camera_motion_detection_capture_visible: true`).
2. When the screensaver (slideshow) starts, the WebView **pauses** the camera video, and wallpanel does not resume it.

This module does not depend on the autoplay setting and works around both issues:

- the camera video is kept **visible** (2×2 px, opacity 0.01) so the WebView delivers real frames;
- it calls `play()` again whenever the video gets paused, and reopens the camera if the stream ends or stays black;
- on motion it stops the wallpanel screensaver (`wallpanel-view.stopScreensaver()`) and resets the idle timer;
- optionally it toggles an `input_boolean`, which gives you a "presence in front of the tablet" sensor for automations.

Tested on a Samsung Galaxy Tab A (SM-T510, Android 11) with HA Companion 2026.11 and wallpanel 4.68.

## Installation

### HACS (custom repository)

HACS → ⋮ → **Custom repositories** → URL `https://github.com/mezoo/wallpanel-motion`, type **Dashboard**. Install *Wallpanel Motion*; HACS adds the resource automatically. Then do steps 3 and 4 below.

### Manual

1. Copy `wallpanel-motion.js` to `config/www/`.
2. Settings → Dashboards → ⋮ → **Resources** → Add resource:
   - URL: `/local/wallpanel-motion.js?v=1`
   - Type: **JavaScript module**
3. Disable wallpanel's own camera detection, otherwise both compete for the camera: remove every `camera_motion_detection_*` key from the `wallpanel:` config.
4. Optional: create a toggle helper `input_boolean.tablet_movment` (Settings → Devices & services → Helpers).

Bump `?v=` in the resource URL after every update of the file, so the tablet does not keep the old version in cache.

## Configuration

Edit the `CFG` object at the top of the file:

| Key | Default | Description |
|---|---|---|
| `users` | `['hallway-tab']` | HA user names (display name) the module runs for |
| `facingMode` | `'user'` | `'user'` = front camera, `'environment'` = rear camera |
| `width` / `height` | `64` / `48` | Analysis resolution |
| `intervalMs` | `250` | Analysis interval |
| `pixelDelta` | `25` | Luminance delta (0-255) for a pixel to count as changed |
| `motionRatio` | `0.03` | Share of changed pixels that means motion (3 %) |
| `framesRequired` | `2` | Consecutive frames above the threshold |
| `entity` | `'input_boolean.tablet_movment'` | Toggled on motion, `''` to disable |
| `entityOffDelayMs` | `10000` | Turns the entity back off after this delay without motion |
| `debug` | `false` | Shows the camera preview and live metrics in the bottom-right corner |

Tuning: lower `motionRatio` for more sensitivity; raise `pixelDelta` if lighting changes stop the slideshow.

## Notes

- HTTPS (secure context) is required for camera access.
- The camera stays on permanently: the tablet gets slightly warmer and should stay plugged in.

## License

MIT
