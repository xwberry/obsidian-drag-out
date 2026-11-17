import {
    App,
    FileSystemAdapter,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
} from "obsidian";
import type { WebContents } from "electron";
import { existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";

type ModifierKey = "alt" | "shift" | "ctrl" | "meta" | "none";

interface ElectronRemoteLike {
    getCurrentWebContents?: () => WebContents;
}

type ElectronModule = typeof import("electron");
type ElectronModuleWithRemote = ElectronModule & {
    remote?: ElectronRemoteLike;
};
type WindowWithRequire = Window & {
    require?: (moduleName: string) => unknown;
};

interface DragOutSettings {
    /** Modifier key required to trigger external drag. "none" = always on. */
    modifierKey: ModifierKey;
    /** Show a brief notice on first successful drag (helpful for verifying setup). */
    debugLogging: boolean;
}

const DEFAULT_SETTINGS: DragOutSettings = {
    // Option is the macOS copy modifier. Cmd asks Finder for an alias, which
    // startDrag does not offer, so the drop is refused while Cmd is held.
    modifierKey: process.platform === "darwin" ? "alt" : "ctrl",
    debugLogging: false,
};

/**
 * Selectors for items in Obsidian's file tree that we want to intercept
 * drags from. .nav-file-title is a file, .nav-folder-title is a folder.
 */
const FILE_TREE_SELECTOR = ".nav-file-title, .nav-folder-title";

const DRAG_ICON_SIZE = 32;

// Opaque fallback. An empty image makes startDrag return without dragging,
// and macOS is the platform that enforces that.
const FALLBACK_ICON_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR42mOwsrL6TwlmGDVg1IBRA4aLAQB3iq0QgO3WlgAAAABJRU5ErkJggg==";

function isModifierKey(value: unknown): value is ModifierKey {
    return (
        value === "alt" ||
        value === "shift" ||
        value === "ctrl" ||
        value === "meta" ||
        value === "none"
    );
}

function isDragOutSettings(value: unknown): value is Partial<DragOutSettings> {
    if (!value || typeof value !== "object") {
        return false;
    }

    const settings = value as Partial<Record<keyof DragOutSettings, unknown>>;
    return (
        (settings.modifierKey === undefined ||
            isModifierKey(settings.modifierKey)) &&
        (settings.debugLogging === undefined ||
            typeof settings.debugLogging === "boolean")
    );
}

export default class DragOutPlugin extends Plugin {
    settings: DragOutSettings = DEFAULT_SETTINGS;
    private iconPath: string | null = null;
    private dragIconPath: string | null = null;

    async onload() {
        await this.loadSettings();

        // Resolve absolute path to our bundled icon (used as drag image).
        this.resolveIconPath();

        // Register dragstart at capture phase so we run before Obsidian's
        // own handler that sets the obsidian:// URI on the dataTransfer.
        this.registerDomEvent(
            activeDocument,
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
        const candidateIconPath = path.join(pluginDir, "icon.png");
        this.iconPath = existsSync(candidateIconPath) ? candidateIconPath : null;
    }

    private isModifierPressed(evt: DragEvent): boolean {
        switch (this.settings.modifierKey) {
            case "alt":
                return evt.altKey;
            case "shift":
                return evt.shiftKey;
            case "ctrl":
                return evt.ctrlKey;
            case "meta":
                return evt.metaKey;
            case "none":
                return true;
        }
    }

    private handleDragStart(evt: DragEvent): void {
        if (!this.isModifierPressed(evt)) return;

        const target = evt.target as HTMLElement | null;
        if (!target) return;

        // Only intercept drags that originate inside the file tree.
        const fileItem = target.closest(FILE_TREE_SELECTOR);
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
        // Collect all selected paths in case of multi-select drag.
        const absolutePaths = this.collectSelectedAbsolutePaths(
            relativePath,
            adapter
        );

        if (absolutePaths.length === 0) {
            this.log("no paths resolved, falling through to default drag");
            return;
        }

        // Reach into Electron and call webContents.startDrag.
        const webContents = this.getWebContents();
        if (!webContents) {
            new Notice(
                "Could not access Electron drag APIs. " +
                    "Check the developer console (Ctrl+Shift+I) for details."
            );
            return;
        }

        try {
            const icon = this.getDragIcon();
            if (!icon) {
                // startDrag returns without throwing when the icon is empty,
                // which would also cancel Obsidian's own drag below.
                this.log("drag icon is empty, falling through to default drag");
                return;
            }
            const dragItem = this.buildDragItem(absolutePaths, icon);
            webContents.startDrag(dragItem);
            // Suppress Obsidian's default behavior (which writes an obsidian:// URI
            // onto the clipboard / dataTransfer). We're taking over the drag.
            evt.preventDefault();
            evt.stopPropagation();
            this.log("startDrag invoked", absolutePaths);
        } catch (err) {
            console.error("[DragOut] startDrag failed:", err);
            new Notice("Drag failed. See console for details.");
        }
    }

    /**
     * Build the argument object passed to webContents.startDrag.
     * - Single path: pass `file`.
     * - Multiple paths: pass `files` (overrides `file`).
     * - `icon` is a filesystem path. Electron loads it in the main process.
     */
    private buildDragItem(
        absolutePaths: string[],
        icon: string
    ): {
        file: string;
        files?: string[];
        icon: string;
    } {
        if (absolutePaths.length === 1) {
            return { file: absolutePaths[0], icon };
        }
        return { file: absolutePaths[0], files: absolutePaths, icon };
    }

    /**
     * Write a small non-empty PNG and return its path.
     * A NativeImage passed through Obsidian's remote shim can arrive empty.
     * Electron then skips the drag and does not throw.
     */
    private getDragIcon(): string | null {
        if (this.dragIconPath && existsSync(this.dragIconPath)) {
            return this.dragIconPath;
        }

        const electron = this.requireElectron();
        const fromFile = this.iconPath
            ? electron.nativeImage.createFromPath(this.iconPath)
            : null;
        const image =
            fromFile && !fromFile.isEmpty()
                ? fromFile
                : electron.nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL);
        if (image.isEmpty()) {
            return null;
        }

        const sized = image.resize({
            width: DRAG_ICON_SIZE,
            height: DRAG_ICON_SIZE,
        });
        if (sized.isEmpty()) {
            return null;
        }

        const iconFile = path.join(
            tmpdir(),
            `obsidian-drag-out-${this.manifest.id}.png`
        );
        writeFileSync(iconFile, sized.toPNG());
        if (
            !existsSync(iconFile) ||
            electron.nativeImage.createFromPath(iconFile).isEmpty()
        ) {
            return null;
        }

        this.dragIconPath = iconFile;
        return iconFile;
    }

    private resolveAbsolutePath(
        adapter: FileSystemAdapter,
        relativePath: string
    ): string | null {
        const absolutePath = adapter.getFullPath(relativePath);
        return existsSync(absolutePath) ? absolutePath : null;
    }

    /**
     * Walk the visible file tree to find every currently-selected item.
     * If nothing is "selected" (single-click drag), we just return the
     * item the drag started on. Folders pass through too — Electron's
     * startDrag accepts folder paths on Windows and macOS.
     */
    private collectSelectedAbsolutePaths(
        currentRelative: string,
        adapter: FileSystemAdapter
    ): string[] {
        const selectedNodes = activeDocument.querySelectorAll(
            ".nav-file-title.is-selected, .nav-folder-title.is-selected"
        );

        const seen = new Set<string>();
        const out: string[] = [];

        const push = (rel: string) => {
            const abs = this.resolveAbsolutePath(adapter, rel);
            if (!abs || seen.has(abs)) {
                return;
            }
            seen.add(abs);
            out.push(abs);
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
            const electronRemote = (activeWindow as WindowWithRequire).require?.(
                "@electron/remote"
            ) as ElectronRemoteLike | undefined;
            if (electronRemote?.getCurrentWebContents) {
                return electronRemote.getCurrentWebContents();
            }
        } catch {
            /* fall through */
        }

        // Path 2: legacy electron.remote (pre-Electron 14 — Obsidian still
        // exposes this on at least some versions).
        try {
            const electron = this.requireElectron() as ElectronModuleWithRemote;
            if (electron.remote?.getCurrentWebContents) {
                return electron.remote.getCurrentWebContents();
            }
        } catch {
            /* fall through */
        }

        return null;
    }

    private requireElectron(): typeof import("electron") {
        // Use window.require to bypass any bundler that might have rewritten
        // a top-level require call into something else.
        const req = (activeWindow as WindowWithRequire).require ?? require;
        return req("electron") as ElectronModule;
    }

    private log(...args: unknown[]): void {
        if (this.settings.debugLogging) {
            console.debug("[DragOut]", ...args);
        }
    }

    async loadSettings(): Promise<void> {
        const loadedData = (await this.loadData()) as unknown;
        const loadedSettings = isDragOutSettings(loadedData) ? loadedData : {};

        this.settings = {
            ...DEFAULT_SETTINGS,
            ...loadedSettings,
        };
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
                    "The default is Ctrl on Windows and Linux, and Option on macOS. " +
                    "Hold it through the drop. On macOS, Cmd asks Finder for an alias " +
                    "and the drop is refused. Control-click opens the file menu. " +
                    "Pick 'None' to always use external drag — but be aware " +
                    "this disables Obsidian's built-in file-tree drag behavior."
            )
            .addDropdown((dd) =>
                dd
                    .addOption("ctrl", "Ctrl (default on Windows/Linux)")
                    .addOption("alt", "Alt/option (default on macOS)")
                    .addOption("meta", "Cmd")
                    .addOption("shift", "Shift")
                    .addOption("none", "None — always intercept")
                    .setValue(this.plugin.settings.modifierKey)
                    .onChange(async (value) => {
                        if (!isModifierKey(value)) {
                            return;
                        }

                        this.plugin.settings.modifierKey = value;
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
