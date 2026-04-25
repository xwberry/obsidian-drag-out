# Drag Out

Drag files from Obsidian's file explorer to other apps using native OS
drag-and-drop instead of dropping an `obsidian://` URL.

This is useful for browser upload fields, email attachments, chat apps, file
managers, and other places that expect an actual file from your filesystem.

**Status:** experimental, desktop only. Tested primarily on Windows so far;
macOS and Linux feedback is welcome.

## What It Does

Obsidian's file tree is a virtual UI. By default, dragging a note out of the
file tree gives other apps a link like `obsidian://open?vault=Vault&file=Note.md`
instead of the file itself.

Drag Out intercepts file-tree drags when your configured modifier key is held
and uses Electron's `webContents.startDrag` API to expose the real on-disk file
path. Normal Obsidian drag behavior is left alone when the modifier is not held.

## Installation

Drag Out is not in the Obsidian community plugin marketplace yet. To install it
manually:

1. Download the release assets: `main.js` and `manifest.json`. If the release
   includes `icon.png`, download that too.
2. Open your vault folder.
3. Create this folder if it does not already exist:

```text
.obsidian/plugins/drag-out/
```

4. Put the downloaded files in that folder.
5. In Obsidian, go to **Settings > Community plugins > Installed plugins**,
   refresh the plugin list, and enable **Drag Out**.

If Restricted Mode is on, Obsidian will ask you to turn it off before enabling
community plugins.

## Usage

Hold the modifier key while dragging a file or folder from Obsidian's left
sidebar file explorer to another app.

The default modifier is:

- **Ctrl** on Windows and Linux
- **Option / Alt** on macOS

You can change the modifier in **Settings > Drag Out**. Available options are
Ctrl/Cmd, Alt/Option, Shift, or None.

Multi-select is supported: select multiple files in Obsidian's file explorer,
then modifier-drag one of the selected files. If you drag an unselected file
while other files are selected, only the file you dragged is sent.

## Why A Modifier Key?

Electron's external drag API takes over the current drag operation. That means
Obsidian's own file-tree drag behavior, such as moving notes between folders,
cannot run during the same drag.

Using a modifier keeps normal Obsidian drags unchanged. If you always want file
drags to go to external apps, set the modifier to **None** in the plugin
settings.

## Platform Notes

- **Windows:** tested most heavily. Holding the modifier while dragging starts
  an external file drag, so Obsidian's internal drop targets will not respond
  during that drag. This is related to Electron's external drag behavior
  ([Electron #7118](https://github.com/electron/electron/issues/7118)).
- **macOS:** expected to work, but needs more real-world testing. The default
  modifier is Option/Alt to avoid conflicting with common Cmd interactions.
- **Linux:** expected to work where Obsidian's Electron drag API is available,
  but currently less tested than Windows.
- **Mobile:** not supported. The plugin is marked `isDesktopOnly`.
- **Cloud placeholders:** files that are not hydrated locally yet, such as
  OneDrive placeholders, may need to download before the target app can use
  them.

## Building From Source

This repo uses Bun for its scripts.

```bash
bun install
bun run build
```

For development watch mode:

```bash
bun run dev
```

The build reads `main.ts` and writes the bundled plugin entrypoint to
`main.js`. `manifest.json` is maintained separately.

## Debugging

Enable **Debug logging** in the plugin settings, then open Obsidian's developer
console with `Ctrl+Shift+I` and try a drag. A successful external drag logs
the resolved filesystem paths.

If you see `Drag Out: could not access Electron's webContents`, please report
your Obsidian version, operating system, and whether you installed from a
release or built from source.

## License

MIT
