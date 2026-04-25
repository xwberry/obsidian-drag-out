import {
    App,
    FileSystemAdapter,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
} from "obsidian";
import type { WebContents, NativeImage } from "electron";
import * as path from "path";

type ModifierKey = "alt" | "shift" | "ctrl" | "none";

interface DragOutSettings {
    /** Modifier key required to trigger external drag. "none" = always on. */
    modifierKey: ModifierKey;
    /** Show a brief notice on first successful drag (helpful for verifying setup). */
    debugLogging: boolean;
}

const DEFAULT_SETTINGS: DragOutSettings = {
    modifierKey: process.platform === "darwin" ? "alt" : "ctrl",
    debugLogging: false,
};

/**
 * Selectors for items in Obsidian's file tree that we want to intercept
 * drags from. .nav-file-title is a file, .nav-folder-title is a folder.
 */
const FILE_TREE_SELECTOR = ".nav-file-title, .nav-folder-title";

export default class DragOutPlugin extends Plugin {
    settings: DragOutSettings = DEFAULT_SETTINGS;
    private iconPath: string | null = null;

    async onload() {
        await this.loadSettings();

        // Resolve absolute path to our bundled icon (used as drag image).
        this.resolveIconPath();

        // Register dragstart at capture phase so we run before Obsidian's
        // own handler that sets the obsidian:// URI on the dataTransfer.
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

    private resolveIconPath(): void {
        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) {
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

    private isModifierPressed(evt: DragEvent): boolean {
        switch (this.settings.modifierKey) {
            case "alt":
                return evt.altKey;
            case "shift":
                return evt.shiftKey;
            case "ctrl":
                // Ctrl on Windows/Linux, Cmd on Mac
                return evt.ctrlKey || evt.metaKey;
            case "none":
                return true;
        }
    }

    private handleDragStart(evt: DragEvent): void {
        if (!this.isModifierPressed(evt)) return;

        const target = evt.target as HTMLElement | null;
        if (!target) return;

        // Only intercept drags that originate inside the file tree.
        const fileItem = target.closest(FILE_TREE_SELECTOR) as HTMLElement | null;
        if (!fileItem) return;

        const relativePath = fileItem.getAttribute("data-path");
        if (!relativePath) {
            this.log("file tree item missing data-path attribute");
            return;
        }

        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) {
            // Not a desktop / FS-backed vault. Nothing we can do.
            return;
        }
        const basePath = adapter.getBasePath();

        // Collect all selected paths in case of multi-select drag.
        const absolutePaths = this.collectSelectedAbsolutePaths(
            relativePath,
            basePath
        );

        if (absolutePaths.length === 0) {
            this.log("no paths resolved, falling through to default drag");
            return;
        }

        // Reach into Electron and call webContents.startDrag.
        const webContents = this.getWebContents();
        if (!webContents) {
            new Notice(
                "Drag Out: could not access Electron's webContents. " +
                    "Check the developer console (Ctrl+Shift+I) for details."
            );
            return;
        }

        try {
            const dragItem = this.buildDragItem(absolutePaths);
            webContents.startDrag(dragItem);
            // Suppress Obsidian's default behavior (which writes an obsidian:// URI
            // onto the clipboard / dataTransfer). We're taking over the drag.
            evt.preventDefault();
            evt.stopPropagation();
            this.log("startDrag invoked", absolutePaths);
        } catch (err) {
            console.error("[DragOut] startDrag failed:", err);
            new Notice("Drag Out: drag failed. See console for details.");
        }
    }

    /**
     * Build the argument object passed to webContents.startDrag.
     * - Single path: pass `file`.
     * - Multiple paths: pass `files` (overrides `file`).
     * - `icon` is required and must be non-empty on macOS.
     */
    private buildDragItem(absolutePaths: string[]): {
        file: string;
        files?: string[];
        icon: string | NativeImage;
    } {
        const electron = this.requireElectron();
        const icon = this.iconPath
            ? this.iconPath
            : electron.nativeImage.createEmpty();
    
        if (absolutePaths.length === 1) {
            return { file: absolutePaths[0], icon };
        }
        return { file: absolutePaths[0], files: absolutePaths, icon };
    }

    /**
     * Walk the visible file tree to find every currently-selected item.
     * If nothing is "selected" (single-click drag), we just return the
     * item the drag started on. Folders pass through too — Electron's
     * startDrag accepts folder paths on Windows and macOS.
     */
    private collectSelectedAbsolutePaths(
        currentRelative: string,
        basePath: string
    ): string[] {
        const selectedNodes = document.querySelectorAll(
            ".nav-file-title.is-selected, .nav-folder-title.is-selected"
        );

        const seen = new Set<string>();
        const out: string[] = [];

        const push = (rel: string) => {
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

        const selectedRelativePaths = Array.from(selectedNodes)
            .map((el) => el.getAttribute("data-path"))
            .filter((rel): rel is string => !!rel);
        
        if (!selectedRelativePaths.includes(currentRelative)) {
            push(currentRelative);
            return out;
        }

        selectedRelativePaths.forEach(push);

        return out;
    }

    /**
     * Resolve Electron's webContents from the renderer. Tries the modern
     * @electron/remote first, then falls back to the legacy electron.remote.
     * Returns null if neither is reachable.
     */
    private getWebContents(): WebContents | null {
        // Path 1: @electron/remote (modern, requires opt-in by host)
        try {
            const electronRemote = (window as any).require?.(
                "@electron/remote"
            );
            if (electronRemote?.getCurrentWebContents) {
                return electronRemote.getCurrentWebContents();
            }
        } catch (_) {
            /* fall through */
        }

        // Path 2: legacy electron.remote (pre-Electron 14 — Obsidian still
        // exposes this on at least some versions).
        try {
            const electron = this.requireElectron();
            if ((electron as any).remote?.getCurrentWebContents) {
                return (electron as any).remote.getCurrentWebContents();
            }
        } catch (_) {
            /* fall through */
        }

        return null;
    }

    private requireElectron(): typeof import("electron") {
        // Use window.require to bypass any bundler that might have rewritten
        // a top-level require call into something else.
        const req = (window as any).require ?? require;
        return req("electron");
    }

    private log(...args: unknown[]): void {
        if (this.settings.debugLogging) {
            console.log("[DragOut]", ...args);
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}

class DragOutSettingTab extends PluginSettingTab {
    plugin: DragOutPlugin;

    constructor(app: App, plugin: DragOutPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Modifier key")
            .setDesc(
                "Hold this key while dragging a file from the file explorer " +
                    "to drag the actual file (instead of an obsidian:// link). " +
                    "Pick 'None' to always use external drag — but be aware " +
                    "this disables Obsidian's built-in drag-to-move-folder behavior on Windows."
            )
            .addDropdown((dd) =>
                dd
                    .addOption("ctrl", "Ctrl / Cmd (default Win)")
                    .addOption("alt", "Alt / Option (default Mac)")
                    .addOption("shift", "Shift")
                    .addOption("none", "None — always intercept")
                    .setValue(this.plugin.settings.modifierKey)
                    .onChange(async (value) => {
                        this.plugin.settings.modifierKey =
                            value as ModifierKey;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Debug logging")
            .setDesc(
                "Log drag events to the developer console (Ctrl+Shift+I). " +
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
