# Running these sketches on macOS

This repo was originally framed around using
[WebViewScreenSaver](https://github.com/liquidx/webviewscreensaver) to
turn any of these sketches into a literal macOS screensaver. That path
has gotten increasingly rough on recent macOS versions. As of macOS 26
(Tahoe), Apple has effectively walked away from third-party screen
savers, so the recommendation here is now different. This doc captures
the state.

## What Apple changed

- **macOS Sonoma (14)** introduced aerial-video screensavers via a
  unified Wallpaper + Screen Saver UI. Third-party `.saver` plugins
  moved onto `legacyScreenSaver.appex` — the "legacy" naming was a
  pretty clear signal.
- **macOS Tahoe (26)** removed the Screen Saver pane entirely; it's a
  modal inside Wallpaper settings now. Apple built a new screensaver
  engine but kept it private — only Apple's aerials use it.
  Third parties are stuck on the legacy runtime, which has acquired
  new Tahoe-specific bugs (no proper `stopAnimation`, screensaver
  instances not destroyed) with no known workaround. The screensaver
  developer community is openly recommending against running anything
  third-party on Tahoe.
- Net effect: the `.saver` plugin path isn't formally killed, but it's
  rotting and there's no public API for the new engine.

## What still works

### Plash (recommended)

[Plash](https://sindresorhus.com/plash) by Sindre Sorhus puts any URL
on your desktop as a live wallpaper. Mac App Store, properly signed,
current on Tahoe. Not technically a screensaver — it's a live desktop
— but the visual effect is what you actually want: when nothing is on
top of the desktop, you see the live sketch.

1. Install Plash from the Mac App Store.
2. In a sketch (e.g. `petri-dish/`), tune the panel to taste, press
   `C` to copy a state-reproducing URL.
3. Paste that URL into Plash.

### WebViewScreenSaver 2.5+ (rough edges)

If you specifically want the screensaver behavior (kick in after idle,
lock the screen) and are willing to live with the rough edges:

- Use [WebViewScreenSaver 2.5+](https://github.com/liquidx/webviewscreensaver/releases),
  which has Tahoe scaling fixes and `macOS 26` improvements. Older
  releases are typically adhoc-signed and AMFI / launch-constraint
  enforcement may reject the bundle silently.
- Known Tahoe bug: the **Options button** in System Settings does
  nothing until you quit and reopen System Settings.
- The legacy-runtime `stopAnimation` / instance-destruction bugs apply
  regardless of WebViewScreenSaver version.

Practical install:

1. Download the latest `.saver` from the WebViewScreenSaver releases
   page.
2. Double-click → "Install for this user only".
3. Strip quarantine recursively (the install propagates the flag to
   nested files in the bundle):

   ```
   xattr -cr ~/Library/Screen\ Savers/WebViewScreenSaver.saver
   ```

4. Open *System Settings → Wallpaper*, scroll to find the Screen Saver
   modal, and pick WebViewScreenSaver. Paste the URL that the sketch
   panel's `C` action copies.

If it shows a black screen, the legacy runtime is failing on your
Tahoe build — fall back to Plash.

## Sources

- [macOS 26 Tahoe Screen Saver issues — Apple Developer Forums](https://developer.apple.com/forums/thread/787444)
- [Screen Saver problems in macOS 26 Tahoe Beta — Aerial #1396](https://github.com/JohnCoates/Aerial/issues/1396)
- [Screen Savers in macOS Tahoe 26 Developer Beta — MacRumors Forums](https://forums.macrumors.com/threads/screen-savers-in-macos-tahoe-26-developer-beta.2458476/)
- [macOS 26 Tahoe Beta — iScreensaver Forum](https://forum.iscreensaver.com/t/macos-26-tahoe-beta/772)
- [WebViewScreenSaver releases](https://github.com/liquidx/webviewscreensaver/releases)
- [Aerial troubleshooting](https://aerialscreensaver.github.io/troubleshooting.html)
