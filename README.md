# wallpanel-motion

Camera motion detection for [lovelace-wallpanel](https://github.com/j-a-n/lovelace-wallpanel) that works inside the **Home Assistant Android Companion app** (Android WebView).

## Why

Wallpanel's built-in `camera_motion_detection_enabled` does not work in the Companion app WebView:

1. Wallpanel reads the camera through a `<video>` element styled `display: none`. Android WebView delivers **black frames** to a hidden video, so no motion is ever detected.
2. When the screensaver (slideshow) starts, the WebView **pauses** the camera video.

This module works around both issues:

- the camera video is kept **visible** (2×2 px, opacity 0.01) so the WebView delivers real frames;
- it calls `play()` again whenever the video gets paused, and reopens the camera if the stream ends or stays black;
- on motion it stops the wallpanel screensaver (`wallpanel-view.stopScreensaver()`) and resets the idle timer;
- optionally it toggles an `input_boolean`, which gives you a "presence in front of the tablet" sensor for automations.

Tested on a Samsung Galaxy Tab A (SM-T510, Android 11) with HA Companion 2026.11 and wallpanel 4.68.

## Installation

1. Copy `wallpanel-motion.js` to `config/www/`.
2. Settings → Dashboards → ⋮ → **Resources** → Add resource:
   - URL: `/local/wallpanel-motion.js?v=1`
   - Type: **JavaScript module**
3. Disable wallpanel's own camera detection, otherwise both compete for the camera: remove every `camera_motion_detection_*` key from the `wallpanel:` config.
4. Optional: create a toggle helper `input_boolean.tablette_mouvement` (Settings → Devices & services → Helpers).

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
| `entity` | `'input_boolean.tablette_mouvement'` | Toggled on motion, `''` to disable |
| `entityOffDelayMs` | `10000` | Turns the entity back off after this delay without motion |
| `debug` | `false` | Shows the camera preview and live metrics in the bottom-right corner |

Tuning: lower `motionRatio` for more sensitivity; raise `pixelDelta` if lighting changes stop the slideshow.

## Notes

- HTTPS (secure context) is required for camera access.
- The camera stays on permanently: the tablet gets slightly warmer and should stay plugged in.
