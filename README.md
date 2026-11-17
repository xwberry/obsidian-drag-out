# Drag Out

Drag files from Obsidian's file explorer to other apps using native OS
drag-and-drop instead of dropping an `obsidian://` URL.

This is useful for browser upload fields, email attachments, chat apps, file
managers, and other places that expect an actual file from your filesystem.

**Status:** experimental, desktop only. Tested on Windows and macOS. Linux
feedback is welcome.

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

Hold the modifier key for the whole drag, including the drop.

The default modifier is:

- **Ctrl** on Windows and Linux
- **Option** on macOS

Those are the copy modifiers. Electron's external drag only offers a copy, so
the key has to mean copy or the target refuses the file.

On macOS, the other keys do not complete the drop:

- **Cmd** starts a drag, then Finder shows a blocked cursor. Browser upload
  fields detect a file and do not accept it. Cmd means "make alias."
- **Control** opens the file menu. The drag never starts.
- **Shift** is the file explorer's range-select key.

**Settings > Drag Out** still lists Ctrl, Option, Cmd, Shift, and None. Pick
**None** only if every file-tree drag should leave Obsidian. That disables
moving notes between folders inside the vault.

Multi-select is supported: select multiple files in the file explorer, then
modifier-drag one of the selected files. If you drag an unselected file while
other files are selected, only the file you dragged is sent. Option-click also
toggles multi-select, so the selection can change as the drag starts.

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
- **macOS:** tested with Option held through the drop, into Finder and into
  browser upload fields. The drag icon is a small PNG written before
  `startDrag`. An empty icon makes that call return without dragging, so the
  plugin leaves Obsidian's own drag alone in that case.
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
console (`Ctrl+Shift+I` on Windows and Linux, `Cmd+Option+I` on macOS) and try
a drag. A successful external drag logs the resolved filesystem paths.

If you see `Drag Out: could not access Electron's webContents`, please report
your Obsidian version, operating system, and whether you installed from a
release or built from source.

## License

MIT
