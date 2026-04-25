# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-04-25
### Added
- This changelog and license.

### Changed
- Default modifier key is now platform-aware: Windows and Linux default to Ctrl,
  while macOS defaults to Alt/Option.
- Multi-select drag behavior is now more precise. Dragging a selected item sends
  all selected items; dragging an unselected item sends only that item.
- Updated settings copy to describe the current platform defaults and the effect
  of always intercepting file-tree drags.
- Reworked the README for a public audience, including current usage defaults,
  manual install steps, Bun-based build commands, platform notes, and debugging
  guidance.

### Fixed
- Moved the default behavior suppression to take place after the drag capture
  operations succeed to avoid null behavior.
- Release script now aborts if either required file (manifest.json, main.js) are missing.
- Drag icon handling no longer assumes `icon.png` is bundled. If no icon file is
  present, the plugin falls back to a tiny embedded native image so external
  drag still has a non-empty icon for macOS.

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
