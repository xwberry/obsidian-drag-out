# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- macOS drops into Finder and browser upload fields. Hold Option through the
  drop. Option is the copy modifier, and Electron's external drag only offers
  a copy.
- Cmd is not a working macOS modifier. The drag starts, then Finder shows a
  blocked cursor and a browser upload detects the file without accepting it.
  Cmd means "make alias."
- Control is not a working macOS modifier. Control-click opens the file menu,
  so the drag never starts.
- Empty drag icons no longer cancel Obsidian's own drag. `startDrag` returns
  without throwing when the icon is empty. The plugin now writes a small PNG
  and passes that path. A missing file falls through the same way.

### Changed
- Default modifier remains Ctrl on Windows and Linux, and Option on macOS.
  Settings text names the keys that complete a drop.

## [0.1.2] - 2026-04-25
### Added
- This changelog and license.
- Local Obsidian plugin linting with `eslint-plugin-obsidianmd` and a `bun run lint`
  script for preflight checks before community plugin submission.

### Changed
- Default modifier key is now platform-aware: Windows and Linux default to Ctrl,
  while macOS defaults to Alt/Option.
- Multi-select drag behavior is now more precise. Dragging a selected item sends
  all selected items; dragging an unselected item sends only that item.
- Updated settings copy to describe the current platform defaults and the effect
  of always intercepting file-tree drags.
- Updated internal drag handling to use Obsidian's active document/window globals
  for better popout window compatibility.
- Expanded release automation to bump versions without Bun's prefixed git tags,
  refresh existing GitHub release assets, and publish loose release files with
  the GitHub CLI, including optional branch pushes and explicit tag moves for
  updating GitHub's generated source archives.
- Added a release dry-run mode to preview version, build, staging, tag, and
  GitHub release actions without changing files or assets.
- Reworked the README for a public audience, including current usage defaults,
  manual install steps, Bun-based build commands, platform notes, and debugging
  guidance.

### Fixed
- Moved the default behavior suppression to take place after the drag capture
  operations succeed to avoid null behavior.
- Release script now aborts if either required file (manifest.json, main.js) are missing,
  or if the manifest doesn't have a valid minAppVersion.
- Drag icon handling no longer assumes `icon.png` is bundled. If no icon file is
  present, the plugin falls back to a tiny embedded native image so external
  drag still has a non-empty icon for macOS.
- Addressed Obsidian review-bot lint findings for unnecessary assertions, UI
  sentence case, explicit `any` usage, debug logging, and unused catch bindings.

### Removed
- Original hand-written main.js test script before running esbuild.

## [0.1.1] - 2026-04-25

### Changed
- Default modifier key is now Ctrl (Cmd on macOS) instead of Alt. Holding Ctrl
  during drag matches Windows Explorer's "force copy" semantic, so the file
  drops cleanly without a "release modifier first" step. Alt remains
  selectable in settings for users who prefer it.

### Fixed
- TypeScript build no longer fails on `Electron.*` type references — proper
  type imports replaced bare global references.
- `buildDragItem` return type now satisfies Electron's `Item` interface
  (single-file drags include the required `file` field).

## [0.1.0] - 2026-04-25

### Added
- Initial release.
- Drag any file from Obsidian's file explorer to external applications using
  the OS's native drag-and-drop, instead of Obsidian's default
  `obsidian://open?...` URI.
- Multi-select drag support — Ctrl/Cmd-click multiple files, then drag any
  one to bring them all.
- Folder drag support (experimental).
- Configurable modifier key (Ctrl, Alt, Shift, or none).
- Optional debug logging to developer console.
- Bundled drag image using the Obsidian community brand black icon.
