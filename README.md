# Drag Out — Obsidian Plugin

Lets you drag files out of Obsidian's file explorer to other apps (browser
upload fields, email clients, Claude/ChatGPT, system file manager, etc.) using
the OS's native drag-and-drop, instead of getting an unhelpful `obsidian://`
URL when you drop.

**Status:** experimental v0.1. Desktop-only.

---

## What problem this solves

Obsidian's file tree is a virtual UI element — when you drag a file out of it,
the OS only sees a string like `obsidian://open?vault=Foo&file=bar.md`. Most
external apps either ignore that or treat it as text, so you can't actually
upload the file. The official workaround is right-click → "Show in system
explorer" → drag from File Explorer / Finder. That works, but it's three
steps too many when you do it dozens of times a day.

This plugin intercepts drags from the file tree and uses Electron's
`webContents.startDrag` API to expose the real on-disk path, so the OS
treats the dragged item like any other file.

## Install (manual, for testing)

This isn't in the community plugin marketplace yet. To install:

1. Open your vault folder in File Explorer
2. Navigate to `.obsidian/plugins/` (create the `plugins` folder if missing)
3. Create a folder named `drag-out`
4. Copy these three files into it:
  - `main.js`
  - `manifest.json`
  - `icon.png`
5. In Obsidian: **Settings → Community plugins → Installed plugins**, click
  the refresh icon, then enable **Drag Out**

If Restricted Mode is on, Obsidian will prompt you to turn it off first.
This is expected for any community plugin.

## Use

1. Hold **Alt** (or **Option** on Mac)
2. Drag a file from Obsidian's left sidebar file tree to wherever you want it
3. Release

Without the modifier, Obsidian's normal drag behavior is unchanged. The
modifier key is configurable in the plugin's settings tab.

Multi-select drag works: Ctrl/Cmd-click multiple files first, then Alt-drag
any one of them. All selected files come along.

## Why a modifier key?

Calling `startDrag` takes over the drag from Obsidian, which means
Obsidian's own drag features (move file to another folder by dropping it
on the folder, etc.) won't work *during* an external drag. By gating it
on a modifier key, normal drags still work the way you expect. If you don't
care about Obsidian's internal drag-and-drop, set the modifier to "None"
in settings to always intercept.

## Building from source

> Note: build scripts rely on Bun, so building from this repo's source as-is  
> won't work with npm commands. Update scripts in package.json and   
> release.mjs to accommodate or install Bun.

```bash
npm install
npm run build      # one-shot production build → main.js
npm run dev        # watch mode for development
```

The build expects `main.ts`, produces `main.js` next to it. `manifest.json`
and `icon.png` aren't touched by the build.

## Known issues / things to watch for

- **Windows: in-app drop targets break during external drag.** This is a known
Electron limitation, not specific to this plugin
([Electron #7118](https://github.com/electron/electron/issues/7118)).
It's why the modifier key default exists.
- **Drag image is static.** It's the bundled `icon.png`. Eventually it
could render the actual file's icon, but that's more code than v0.1
warrants.
- **Folders.** Dragging a folder *should* work (Electron's `startDrag` accepts
folder paths) but is less tested than file drag.
- **Mobile.** Plugin is `isDesktopOnly: true` and won't load on iOS / Android.
- **Symlinks / OneDrive virtual files.** If a vault file is an unhydrated
cloud placeholder, the OS will try to download it during the drag, which
may add a delay.

## Debugging

Enable **Debug logging** in the plugin settings, then open the developer
console (Ctrl+Shift+I) and try a drag. You should see entries like:

```text
[DragOut] startDrag invoked ['C:\Users\you\Vault\Unsorted\note.md']
```

If you see `Could not access Electron's webContents`, the API access path
is broken — please report which Obsidian version you're on.

## License

MIT.