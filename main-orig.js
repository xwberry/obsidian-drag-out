/*
 * obsidian-drag-out — pre-built plugin entry point.
 *
 * This file is a hand-written CommonJS build of main.ts. To rebuild from
 * source: npm install && npm run build (will overwrite this file).
 */

"use strict";

const obsidian = require("obsidian");
const path = require("path");

const DEFAULT_SETTINGS = {
    modifierKey: "alt",
    debugLogging: false,
};

const FILE_TREE_SELECTOR = ".nav-file-title, .nav-folder-title";

class DragOutPlugin extends obsidian.Plugin {
    constructor() {
        super(...arguments);
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
        this.iconPath = null;
    }

    async onload() {
        await this.loadSettings();
        this.resolveIconPath();

        this.registerDomEvent(
            document,
            "dragstart",
            (evt) => this.handleDragStart(evt),
            { capture: true }
        );

        this.addSettingTab(new DragOutSettingTab(this.app, this));
        this.log("Drag Out loaded");
    }

    onunload() {
        this.log("Drag Out unloaded");
    }

    resolveIconPath() {
        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof obsidian.FileSystemAdapter)) {
            this.iconPath = null;
            return;
        }
        const pluginDir = path.join(
            adapter.getBasePath(),
            this.app.vault.configDir,
            "plugins",
            this.manifest.id
        );
        this.iconPath = path.join(pluginDir, "icon.png");
    }

    isModifierPressed(evt) {
        switch (this.settings.modifierKey) {
            case "alt":
                return evt.altKey;
            case "shift":
                return evt.shiftKey;
            case "ctrl":
                return evt.ctrlKey || evt.metaKey;
            case "none":
                return true;
            default:
                return false;
        }
    }

    handleDragStart(evt) {
        if (!this.isModifierPressed(evt)) return;

        const target = evt.target;
        if (!target || !(target instanceof HTMLElement)) return;

        const fileItem = target.closest(FILE_TREE_SELECTOR);
        if (!fileItem) return;

        const relativePath = fileItem.getAttribute("data-path");
        if (!relativePath) {
            this.log("file tree item missing data-path attribute");
            return;
        }

        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof obsidian.FileSystemAdapter)) return;
        const basePath = adapter.getBasePath();

        const absolutePaths = this.collectSelectedAbsolutePaths(
            relativePath,
            basePath
        );
        if (absolutePaths.length === 0) {
            this.log("no paths resolved");
            return;
        }

        const webContents = this.getWebContents();
        if (!webContents) {
            new obsidian.Notice(
                "Drag Out: could not access Electron's webContents. " +
                    "Open dev console (Ctrl+Shift+I) for details."
            );
            return;
        }

        evt.preventDefault();
        evt.stopPropagation();

        try {
            const dragItem = this.buildDragItem(absolutePaths);
            webContents.startDrag(dragItem);
            this.log("startDrag invoked", absolutePaths);
        } catch (err) {
            console.error("[DragOut] startDrag failed:", err);
            new obsidian.Notice(
                "Drag Out: drag failed. See console for details."
            );
        }
    }

    buildDragItem(absolutePaths) {
        const electron = this.requireElectron();
        const icon = this.iconPath
            ? this.iconPath
            : electron.nativeImage.createEmpty();

        if (absolutePaths.length === 1) {
            return { file: absolutePaths[0], icon };
        }
        return { files: absolutePaths, icon };
    }

    collectSelectedAbsolutePaths(currentRelative, basePath) {
        const selectedNodes = document.querySelectorAll(
            ".nav-file-title.is-selected, .nav-folder-title.is-selected"
        );

        const seen = new Set();
        const out = [];

        const push = (rel) => {
            const abs = path.join(basePath, rel);
            if (!seen.has(abs)) {
                seen.add(abs);
                out.push(abs);
            }
        };

        if (selectedNodes.length === 0) {
            push(currentRelative);
            return out;
        }

        selectedNodes.forEach((el) => {
            const rel = el.getAttribute("data-path");
            if (rel) push(rel);
        });

        push(currentRelative); // ensure current item included
        return out;
    }

    getWebContents() {
        // Path 1: @electron/remote (modern path)
        try {
            const req = window.require ? window.require : require;
            const electronRemote = req("@electron/remote");
            if (electronRemote && electronRemote.getCurrentWebContents) {
                return electronRemote.getCurrentWebContents();
            }
        } catch (_) {
            /* not available */
        }

        // Path 2: legacy electron.remote
        try {
            const electron = this.requireElectron();
            if (electron.remote && electron.remote.getCurrentWebContents) {
                return electron.remote.getCurrentWebContents();
            }
        } catch (_) {
            /* not available */
        }

        return null;
    }

    requireElectron() {
        const req = window.require ? window.require : require;
        return req("electron");
    }

    log(...args) {
        if (this.settings.debugLogging) {
            console.log("[DragOut]", ...args);
        }
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class DragOutSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        new obsidian.Setting(containerEl)
            .setName("Modifier key")
            .setDesc(
                "Hold this key while dragging from the file explorer to drag the actual file " +
                    "(instead of an obsidian:// link). Pick 'None' to always intercept — note " +
                    "this disables built-in drag-to-move-folder on Windows."
            )
            .addDropdown((dd) =>
                dd
                    .addOption("alt", "Alt / Option (recommended)")
                    .addOption("shift", "Shift")
                    .addOption("ctrl", "Ctrl / Cmd")
                    .addOption("none", "None — always intercept")
                    .setValue(this.plugin.settings.modifierKey)
                    .onChange(async (value) => {
                        this.plugin.settings.modifierKey = value;
                        await this.plugin.saveSettings();
                    })
            );

        new obsidian.Setting(containerEl)
            .setName("Debug logging")
            .setDesc(
                "Log drag events to developer console (Ctrl+Shift+I). " +
                    "Useful for troubleshooting; leave off otherwise."
            )
            .addToggle((tg) =>
                tg
                    .setValue(this.plugin.settings.debugLogging)
                    .onChange(async (value) => {
                        this.plugin.settings.debugLogging = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}

module.exports = DragOutPlugin;
