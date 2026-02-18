import { Plugin, Dialog, Menu, showMessage } from "siyuan";
import { SiYuanAPI, APIResponse } from "./siyuan-bridge-api";
import "./index.scss";

const STORAGE_NAME = "ai-agent-bridge-config";
const DOCK_TYPE = "ai-dock";
const DOCK_HOTKEY = "⌥⌘A";
type DockPosition = "LeftTop" | "LeftBottom" | "RightTop" | "RightBottom" | "BottomLeft" | "BottomRight" | "Left" | "Right" | "Bottom";

interface PluginConfig {
    enableLogging: boolean;
    openCodeUrl: string;
    dockPosition: DockPosition;
    dockWidth: number;
    dockHeight: number;
    enableDock: boolean;
}

export default class AIAgentBridgePlugin extends Plugin {
    public api!: SiYuanAPI;
    private dockCreated = false;
    private config: PluginConfig = {
        enableLogging: true,
        openCodeUrl: "http://localhost:4096",
        dockPosition: "Right",
        dockWidth: 320,
        dockHeight: 500,
        enableDock: true,
    };

    async onload() {
        this.api = new SiYuanAPI(this);
        await this.loadConfig();
        
        // 注册 AI 图标
        this.addIcons(`<symbol id="iconAI" viewBox="0 0 32 32">
<path d="M16 2c-7.732 0-14 6.268-14 14s6.268 14 14 14 14-6.268 14-14-6.268-14-14-14zM16 26c-5.514 0-10-4.486-10-10s4.486-10 10-10 10 4.486 10 10-4.486 10-10 10z"></path>
<path d="M16 8c-0.552 0-1 0.448-1 1v6c0 0.552 0.448 1 1 1s1-0.448 1-1v-6c0-0.552-0.448-1-1-1z"></path>
<path d="M20.5 12.5c-0.276 0-0.5 0.224-0.5 0.5v2c0 0.276 0.224 0.5 0.5 0.5s0.5-0.224 0.5-0.5v-2c0-0.276-0.224-0.5-0.5-0.5z"></path>
<path d="M11.5 12.5c-0.276 0-0.5 0.224-0.5 0.5v2c0 0.276 0.224 0.5 0.5 0.5s0.5-0.224 0.5-0.5v-2c0-0.276-0.224-0.5-0.5-0.5z"></path>
<path d="M12 20c0.8 1.2 2.2 2 3.8 2s3-0.8 3.8-2l-1.2-0.8c-0.5 0.8-1.4 1.3-2.4 1.3s-1.9-0.5-2.4-1.3l-1.2 0.8z"></path>
</symbol>`);
        
        // 在 onload 中创建 Dock
        if (this.config.enableDock) {
            this.createDock();
        }

        this.addCommand({
            langKey: "openAIAgentDock",
            hotkey: DOCK_HOTKEY,
            callback: () => this.openDock(),
        });
        
    }

    onLayoutReady() {
        // 插件加载完成
    }

    async onunload() {
        // 清理资源
    }

    private async loadConfig() {
        const stored = await this.loadData(STORAGE_NAME);
        if (stored) this.config = { ...this.config, ...stored };
    }

    private async saveConfig() {
        await this.saveData(STORAGE_NAME, this.config);
    }

    /** 打开 AI Agent 侧边栏 */
    private openDock() {
        try {
            const globalApp = (window as any).siyuan;
            const layout = globalApp?.layout;
            
            if (!layout) {
                console.warn("[AI Agent Bridge] layout not ready");
                return false;
            }
            
            const pos = this.config.dockPosition;
            let targetDock;
            if (pos.startsWith("Left")) {
                targetDock = layout.leftDock;
            } else if (pos.startsWith("Right")) {
                targetDock = layout.rightDock;
            } else if (pos.startsWith("Bottom")) {
                targetDock = layout.bottomDock;
            }
            
            if (!targetDock) {
                console.warn("[AI Agent Bridge] target dock not found");
                return false;
            }
            
            // 使用 toggleModel 显示 dock
            // toggleModel(type, show=true, close=false, hide=false, isSaveLayout=true)
            if (typeof targetDock.toggleModel === "function") {
                targetDock.toggleModel(DOCK_TYPE, true, false, false, true);
                console.log("[AI Agent Bridge] Dock opened");
                return true;
            }
            
            return false;
        } catch (e) {
            console.error("[AI Agent Bridge] openDock failed:", e);
            return false;
        }
    }
    
    private createDock() {
        if (this.dockCreated) return;
        this.dockCreated = true;
        
        const plugin = this;
        
        this.addDock({
            config: {
                position: "RightTop",
                size: { width: 300, height: 0 },
                icon: "",
                title: "",
                hotkey: DOCK_HOTKEY,
                show: true,
            },
            data: null,
            type: DOCK_TYPE,
            init(dock: any) {
                dock.element.style.width = "100%";
                dock.element.style.height = "100%";
                dock.element.style.overflow = "hidden";
                
                const iframe = document.createElement("iframe");
                iframe.src = plugin.config.openCodeUrl;
                iframe.style.cssText = "width: 100%; height: 100%; border: none; display: block; pointer-events: auto; will-change: auto;";
                iframe.setAttribute("allow", "clipboard-read; clipboard-write");
                dock.element.appendChild(iframe);
                
                // 优化 resize 性能：拖拽时禁用 iframe 交互以减少重绘
                let resizeTimer: ReturnType<typeof setTimeout> | null = null;
                let isResizing = false;
                
                const handleResizeStart = () => {
                    if (!isResizing) {
                        isResizing = true;
                        iframe.style.pointerEvents = "none";
                        iframe.style.willChange = "auto";
                    }
                };
                
                const handleResizeEnd = () => {
                    isResizing = false;
                    // 延迟恢复交互，确保 resize 完成
                    if (resizeTimer) clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        iframe.style.pointerEvents = "auto";
                        iframe.style.willChange = "auto";
                    }, 150);
                };
                
                // 监听 dock 容器的 resize 事件
                const resizeObserver = new ResizeObserver(() => {
                    handleResizeStart();
                    // 重置定时器，防抖处理
                    if (resizeTimer) clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        handleResizeEnd();
                    }, 100);
                });
                
                resizeObserver.observe(dock.element);
                
                // 监听鼠标事件，检测拖拽边缘
                let isDragging = false;
                dock.element.addEventListener("mousedown", (e: MouseEvent) => {
                    // 检查是否在拖拽边缘
                    const rect = dock.element.getBoundingClientRect();
                    const edgeThreshold = 5;
                    const isNearEdge = 
                        e.clientX <= rect.left + edgeThreshold ||
                        e.clientX >= rect.right - edgeThreshold ||
                        e.clientY <= rect.top + edgeThreshold ||
                        e.clientY >= rect.bottom - edgeThreshold;
                    
                    if (isNearEdge) {
                        isDragging = true;
                        handleResizeStart();
                    }
                });
                
                document.addEventListener("mouseup", () => {
                    if (isDragging) {
                        isDragging = false;
                        handleResizeEnd();
                    }
                });
            },
            destroy() {
                console.log("[AI Agent Bridge] dock destroyed");
            },
        });
    }

    openSetting(): void {
        // 创建对话框
        const dialog = new Dialog({
            title: this.i18n.settings ?? "Settings",
            content: `<div id="ai-bridge-setting-panel" class="fn__flex-column" style="gap:12px;padding:16px;"></div>`,
            width: "480px",
        });

        const panel = dialog.element.querySelector("#ai-bridge-setting-panel")!;

        const addRow = (title: string, desc: string | undefined, el: HTMLElement) => {
            const row = document.createElement("div");
            row.className = "b3-form__item";
            row.innerHTML = `<div class="b3-form__label">${title}</div>`;
            if (desc) {
                const descEl = document.createElement("div");
                descEl.className = "b3-form__desc";
                descEl.textContent = desc;
                row.appendChild(descEl);
            }
            const action = document.createElement("div");
            action.className = "b3-form__action";
            action.appendChild(el);
            row.appendChild(action);
            panel.appendChild(row);
        };

        const enableDock = document.createElement("input");
        enableDock.type = "checkbox";
        enableDock.checked = this.config.enableDock;
        enableDock.className = "b3-switch";
        enableDock.addEventListener("change", async () => {
            this.config.enableDock = enableDock.checked;
            await this.saveConfig();
            showMessage(this.i18n.restartRequired ?? "Please restart plugin to apply changes");
        });
        addRow(this.i18n.enableDock ?? "Enable AI Agent Dock", this.i18n.enableDockDesc, enableDock);

        const openCodeUrl = document.createElement("input");
        openCodeUrl.type = "text";
        openCodeUrl.className = "b3-text-field fn__block";
        openCodeUrl.value = this.config.openCodeUrl;
        openCodeUrl.placeholder = "http://localhost:4096";
        openCodeUrl.addEventListener("change", async () => {
            this.config.openCodeUrl = openCodeUrl.value;
            await this.saveConfig();
            showMessage(this.i18n.restartRequired ?? "Please restart plugin to apply changes");
        });
        addRow(this.i18n.openCodeUrl ?? "OpenCode URL", this.i18n.openCodeUrlDesc, openCodeUrl);

        const dockPosition = document.createElement("select");
        dockPosition.className = "b3-select fn__block";
        (["LeftTop", "LeftBottom", "RightTop", "RightBottom", "BottomLeft", "BottomRight", "Left", "Right", "Bottom"] as DockPosition[]).forEach((pos) => {
            const opt = document.createElement("option");
            opt.value = pos;
            opt.textContent = pos;
            if (pos === this.config.dockPosition) opt.selected = true;
            dockPosition.appendChild(opt);
        });
        dockPosition.addEventListener("change", async () => {
            this.config.dockPosition = dockPosition.value as DockPosition;
            await this.saveConfig();
            showMessage(this.i18n.restartRequired ?? "Please restart plugin to apply changes");
        });
        addRow(this.i18n.dockPosition ?? "Dock Position", this.i18n.dockPositionDesc, dockPosition);

        const enableLogging = document.createElement("input");
        enableLogging.type = "checkbox";
        enableLogging.checked = this.config.enableLogging;
        enableLogging.className = "b3-switch";
        enableLogging.addEventListener("change", async () => {
            this.config.enableLogging = enableLogging.checked;
            await this.saveConfig();
        });
        addRow(this.i18n.enableLogging ?? "Enable Logging", undefined, enableLogging);
    }

    public async executeCommand(command: string, params: any): Promise<APIResponse> {
        if (this.config.enableLogging) console.log(`[AI Agent Bridge] Executing: ${command}`, params);
        try {
            switch (command) {
                case "notebooks.list": return await this.api.getNotebooks();
                case "notebooks.create": return await this.api.createNotebook(params.name);
                case "notebooks.rename": return await this.api.renameNotebook(params.id, params.name);
                case "notebooks.delete": return await this.api.removeNotebook(params.id);
                case "notebooks.open": return await this.api.openNotebook(params.id);
                case "notebooks.close": return await this.api.closeNotebook(params.id);
                case "docs.list": return await this.api.getDocsByNotebook(params.notebookId, params.path);
                case "docs.create": return await this.api.createDoc(params.notebookId, params.path, params.content);
                case "docs.get": return await this.api.getDocContent(params.id);
                case "docs.rename": return await this.api.renameDoc(params.notebookId, params.path, params.newName);
                case "docs.delete": return await this.api.deleteDoc(params.notebookId, params.path);
                case "docs.move": return await this.api.moveDocs(params.srcNotebooks, params.srcPaths, params.destNotebook, params.destPath);
                case "blocks.get": return await this.api.getBlockById(params.id);
                case "blocks.getKramdown": return await this.api.getBlockKramdown(params.id);
                case "blocks.insert": return await this.api.insertBlock(params.parentId, params.dataType, params.data, params.previousId);
                case "blocks.prepend": return await this.api.prependBlock(params.parentId, params.dataType, params.data);
                case "blocks.append": return await this.api.appendBlock(params.parentId, params.dataType, params.data);
                case "blocks.update": return await this.api.updateBlock(params.id, params.dataType, params.data);
                case "blocks.delete": return await this.api.deleteBlock(params.id);
                case "blocks.move": return await this.api.moveBlock(params.id, params.parentId, params.previousId);
                case "blocks.fold": return await this.api.foldBlock(params.id);
                case "blocks.unfold": return await this.api.unfoldBlock(params.id);
                case "attrs.get": return await this.api.getBlockAttrs(params.blockId);
                case "attrs.set": return await this.api.setBlockAttrs(params.blockId, params.attrs);
                case "search.blocks": return await this.api.searchBlock(params.query, params.notebook, params.type);
                case "search.sql": return await this.api.searchEmbedBlock(params.sql, params.embedBlockId, params.excludeIDs);
                case "query.sql": return await this.api.querySQL(params.sql);
                case "assets.upload": return await this.api.uploadAsset(params.file);
                case "files.get": return await this.api.getFile(params.path);
                case "files.put": return await this.api.putFile(params.path, params.file, params.isDir, params.modTime);
                case "files.delete": return await this.api.removeFile(params.path);
                case "files.list": return await this.api.readDir(params.path);
                case "system.info": return await this.api.getSystemConf();
                case "system.version": return await this.api.version();
                case "system.time": return await this.api.getCurrentTime();
                default: return { code: 400, msg: `Unknown command: ${command}` };
            }
        } catch (error: any) {
            console.error(`[AI Agent Bridge] Error executing ${command}:`, error);
            return { code: 500, msg: error.message };
        }
    }

    public getConfig(): PluginConfig {
        return { ...this.config };
    }
}
