import { Plugin, Dialog, showMessage } from "siyuan";

const STORAGE_NAME = "ai-agent-bridge-config";
const DOCK_TYPE = "ai-dock";
const DOCK_HOTKEY = "⌥⌘A";
type DockPosition = "LeftTop" | "LeftBottom" | "RightTop" | "RightBottom" | "BottomLeft" | "BottomRight" | "Left" | "Right" | "Bottom";

interface PluginConfig {
    openCodeUrl: string;
    dockPosition: DockPosition;
    dockWidth: number;
    dockHeight: number;
    enableDock: boolean;
}

export default class AIAgentBridgePlugin extends Plugin {
    private dockCreated = false;
    /** 插件卸载时调用的 dock 清理函数，由 createDock 注册 */
    private dockCleanup: (() => void) | null = null;
    private config: PluginConfig = {
        openCodeUrl: "http://localhost:4096",
        dockPosition: "Right",
        dockWidth: 320,
        dockHeight: 500,
        enableDock: true,
    };

    async onload() {
        await this.loadConfig();
        
        // 注册 AI 图标
        // 原来的图标（已注释）
        // this.addIcons(`<symbol id="iconAI" viewBox="0 0 32 32">
        // <path d="M16 2c-7.732 0-14 6.268-14 14s6.268 14 14 14 14-6.268 14-14-6.268-14-14-14zM16 26c-5.514 0-10-4.486-10-10s4.486-10 10-10 10 4.486 10 10-4.486 10-10 10z"></path>
        // <path d="M16 8c-0.552 0-1 0.448-1 1v6c0 0.552 0.448 1 1 1s1-0.448 1-1v-6c0-0.552-0.448-1-1-1z"></path>
        // <path d="M20.5 12.5c-0.276 0-0.5 0.224-0.5 0.5v2c0 0.276 0.224 0.5 0.5 0.5s0.5-0.224 0.5-0.5v-2c0-0.276-0.224-0.5-0.5-0.5z"></path>
        // <path d="M11.5 12.5c-0.276 0-0.5 0.224-0.5 0.5v2c0 0.276 0.224 0.5 0.5 0.5s0.5-0.224 0.5-0.5v-2c0-0.276-0.224-0.5-0.5-0.5z"></path>
        // <path d="M12 20c0.8 1.2 2.2 2 3.8 2s3-0.8 3.8-2l-1.2-0.8c-0.5 0.8-1.4 1.3-2.4 1.3s-1.9-0.5-2.4-1.3l-1.2 0.8z"></path>
        // </symbol>`);
        
        // 新的图标：竖着的长方体 [] 样式（宽度加倍）
        this.addIcons(`<symbol id="iconAI" viewBox="0 0 32 32">
        <!-- 外框（左侧） -->
        <rect x="8" y="4" width="2" height="24" rx="0.5" fill="currentColor"/>
        <!-- 外框（右侧） -->
        <rect x="22" y="4" width="2" height="24" rx="0.5" fill="currentColor"/>
        <!-- 外框（顶部） -->
        <rect x="8" y="4" width="16" height="2" rx="0.5" fill="currentColor"/>
        <!-- 外框（底部） -->
        <rect x="8" y="26" width="16" height="2" rx="0.5" fill="currentColor"/>
        <!-- 内部填充（可选，增加立体感） -->
        <rect x="10" y="6" width="12" height="20" rx="0.5" fill="currentColor" opacity="0.1"/>
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
        if (this.dockCleanup) {
            this.dockCleanup();
            this.dockCleanup = null;
        }
    }

    uninstall() {
        // 卸载插件时删除插件数据
        this.removeData(STORAGE_NAME).catch(e => {
            showMessage(`uninstall [${this.name}] remove data [${STORAGE_NAME}] fail: ${e.msg}`);
        });
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
                icon: "iconAI",
                title: this.i18n.dockTitle ?? "AI Agent",
                hotkey: DOCK_HOTKEY,
                show: true,
            },
            data: null,
            type: DOCK_TYPE,
            init(dock: any) {
                dock.element.style.width = "100%";
                dock.element.style.height = "100%";
                dock.element.style.minWidth = "200px";
                dock.element.style.minHeight = "180px";
                dock.element.style.overflow = "hidden";
                dock.element.style.position = "relative";
                dock.element.style.boxSizing = "border-box";
                dock.element.style.border = "1px solid var(--b3-border-color)";
                dock.element.style.borderRadius = "4px";
                
                // 创建初始提示容器（请打开 AI Agent Web）
                const waitingContainer = document.createElement("div");
                waitingContainer.className = "ai-dock-waiting";
                waitingContainer.style.cssText = "display: flex; position: absolute; top: 0; left: 0; width: 100%; height: 100%; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center; color: var(--b3-theme-on-surface); background-color: var(--b3-theme-background); z-index: 10;";
                waitingContainer.innerHTML = `
                    <svg style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">${plugin.i18n.iframeWaiting ?? "Please open AI Agent Web"}</div>
                    <div style="font-size: 14px; opacity: 0.7; margin-bottom: 16px;">${plugin.i18n.iframeWaitingDesc ?? "Waiting for AI Agent Web to start..."}</div>
                    <div class="ai-dock-url" style="font-size: 12px; opacity: 0.5; font-family: monospace; word-break: break-all;"></div>
                `;
                
                // 创建错误提示容器（链接失败）
                const errorContainer = document.createElement("div");
                errorContainer.className = "ai-dock-error";
                errorContainer.style.cssText = "display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center; color: var(--b3-theme-on-surface); background-color: var(--b3-theme-background); z-index: 11;";
                
                // 创建重试按钮
                const retryButton = document.createElement("button");
                retryButton.className = "b3-button b3-button--outline";
                retryButton.style.cssText = "margin-top: 16px;";
                retryButton.textContent = plugin.i18n.retry ?? "Retry";
                
                errorContainer.innerHTML = `
                    <svg style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">${plugin.i18n.iframeLoadError ?? "Failed to load page"}</div>
                    <div style="font-size: 14px; opacity: 0.7; margin-bottom: 16px;">${plugin.i18n.iframeLoadErrorDesc ?? "Please check if the AI Agent Web URL is correct or if the service is running"}</div>
                    <div class="ai-dock-url" style="font-size: 12px; opacity: 0.5; font-family: monospace; word-break: break-all; margin-bottom: 16px;"></div>
                `;
                errorContainer.appendChild(retryButton);
                
                // 先显示等待提示和错误容器
                dock.element.appendChild(waitingContainer);
                dock.element.appendChild(errorContainer);
                
                // 延迟创建 iframe，确保等待容器先显示
                let iframe: HTMLIFrameElement | null = null;
                let loadTimeout: ReturnType<typeof setTimeout> | null = null;
                let retryInterval: ReturnType<typeof setInterval> | null = null;
                let hasLoaded = false;
                let isRetrying = false;
                
                const createIframe = () => {
                    if (iframe) return; // 如果已创建，不再重复创建

                    // 先检测服务是否可用，再创建 iframe
                    showWaiting();

                    checkServiceAvailable().then((available) => {
                        if (!available) {
                            // 服务不可用，显示错误并开始重试
                            showError();
                            startRetry();
                            return;
                        }

                        // 服务可用，创建 iframe
                        iframe = document.createElement("iframe");
                        iframe.src = plugin.config.openCodeUrl;
                        iframe.style.cssText = "width: 100%; height: 100%; border: none; display: none; pointer-events: auto; will-change: auto; position: relative; z-index: 0;";
                        iframe.setAttribute("allow", "clipboard-read; clipboard-write");

                        let iframeLoaded = false;

                        // 监听 iframe 加载事件
                        iframe.onload = () => {
                            iframeLoaded = true;
                            hasLoaded = true;
                            if (loadTimeout) {
                                clearTimeout(loadTimeout);
                                loadTimeout = null;
                            }
                            if (retryInterval) {
                                clearInterval(retryInterval);
                                retryInterval = null;
                            }
                            isRetrying = false;
                            // 跨域情况下，如果能触发 onload，通常表示加载成功
                            showIframe();
                        };

                        // 监听 iframe 错误事件
                        iframe.onerror = () => {
                            hasLoaded = false;
                            if (loadTimeout) {
                                clearTimeout(loadTimeout);
                                loadTimeout = null;
                            }
                            showError();
                            startRetry();
                        };

                        dock.element.appendChild(iframe);

                        // 设置超时检测（5秒后如果还没加载成功，切换到错误状态）
                        loadTimeout = setTimeout(() => {
                            if (!iframeLoaded && iframe) {
                                showError();
                                startRetry();
                            }
                        }, 5000);
                    });
                };
                
                const showWaiting = () => {
                    if (iframe) iframe.style.display = "none";
                    const urlEl = waitingContainer.querySelector(".ai-dock-url");
                    if (urlEl) urlEl.textContent = plugin.config.openCodeUrl;
                    waitingContainer.style.display = "flex";
                    errorContainer.style.display = "none";
                };

                const showError = () => {
                    if (iframe) iframe.style.display = "none";
                    waitingContainer.style.display = "none";
                    const urlEl = errorContainer.querySelector(".ai-dock-url");
                    if (urlEl) urlEl.textContent = plugin.config.openCodeUrl;
                    errorContainer.style.display = "flex";
                };

                const showIframe = () => {
                    if (iframe) {
                        iframe.style.display = "block";
                        waitingContainer.style.display = "none";
                        errorContainer.style.display = "none";
                    }
                };
                
                // 检测服务是否可用 - 使用图片加载方式避免 CORS 问题
                const checkServiceAvailable = (): Promise<boolean> => {
                    return new Promise((resolve) => {
                        const img = new Image();
                        const timeout = setTimeout(() => {
                            img.src = '';
                            resolve(false);
                        }, 2000);

                        img.onload = () => {
                            clearTimeout(timeout);
                            resolve(true);
                        };

                        img.onerror = () => {
                            clearTimeout(timeout);
                            // 图片加载错误可能是 CORS 或 404，但服务可能在运行
                            // 我们尝试用 fetch 再确认一次
                            fetch(plugin.config.openCodeUrl, {
                                method: 'HEAD',
                                mode: 'no-cors',
                                cache: 'no-cache'
                            }).then(() => {
                                resolve(true);
                            }).catch(() => {
                                resolve(false);
                            });
                        };

                        // 添加随机参数避免缓存
                        img.src = `${plugin.config.openCodeUrl}/favicon.ico?_t=${Date.now()}`;
                    });
                };
                
                // 开始重连检测
                const startRetry = () => {
                    if (retryInterval || isRetrying) return;
                    isRetrying = true;

                    retryInterval = setInterval(() => {
                        if (hasLoaded) {
                            if (retryInterval) {
                                clearInterval(retryInterval);
                                retryInterval = null;
                            }
                            isRetrying = false;
                            return;
                        }

                        checkServiceAvailable().then((available) => {
                            if (available && !hasLoaded) {
                                // 服务可用，重新创建 iframe
                                if (retryInterval) {
                                    clearInterval(retryInterval);
                                    retryInterval = null;
                                }
                                isRetrying = false;
                                hasLoaded = false;
                                if (iframe) {
                                    iframe.remove();
                                    iframe = null;
                                }
                                createIframe();
                            }
                        });
                    }, 3000); // 每3秒检测一次
                };
                
                // 重试按钮点击事件
                retryButton.addEventListener("click", () => {
                    if (retryInterval) {
                        clearInterval(retryInterval);
                        retryInterval = null;
                    }
                    isRetrying = false;
                    hasLoaded = false;
                    if (iframe) {
                        iframe.remove();
                        iframe = null;
                    }
                    createIframe();
                });
                
                // 立即开始检测并创建 iframe
                createIframe();
                
                // 优化 resize 性能：拖拽时禁用 iframe 交互以减少重绘
                let resizeTimer: ReturnType<typeof setTimeout> | null = null;
                let isResizing = false;
                
                const handleResizeStart = () => {
                    if (!iframe?.style) return;
                    if (!isResizing) {
                        isResizing = true;
                        iframe.style.pointerEvents = "none";
                        iframe.style.willChange = "auto";
                    }
                };

                const handleResizeEnd = () => {
                    if (!iframe?.style) return;
                    isResizing = false;
                    if (resizeTimer) clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        if (iframe?.style) {
                            iframe.style.pointerEvents = "auto";
                            iframe.style.willChange = "auto";
                        }
                    }, 150);
                };

                const handleResizeObserver = () => {
                    handleResizeStart();
                    if (resizeTimer) clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(handleResizeEnd, 100);
                };

                const resizeObserver = new ResizeObserver(handleResizeObserver);
                
                resizeObserver.observe(dock.element);

                // 监听鼠标事件，检测拖拽边缘
                let isDragging = false;
                const handleMouseUp = () => {
                    if (isDragging) {
                        isDragging = false;
                        handleResizeEnd();
                    }
                };
                dock.element.addEventListener("mousedown", (e: MouseEvent) => {
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
                document.addEventListener("mouseup", handleMouseUp);

                // 统一清理：定时器、重连、iframe、ResizeObserver、全局事件，供 destroy 与 onunload 调用
                const cleanup = () => {
                    if (loadTimeout) {
                        clearTimeout(loadTimeout);
                        loadTimeout = null;
                    }
                    if (retryInterval) {
                        clearInterval(retryInterval);
                        retryInterval = null;
                    }
                    if (resizeTimer) {
                        clearTimeout(resizeTimer);
                        resizeTimer = null;
                    }
                    resizeObserver.disconnect();
                    document.removeEventListener("mouseup", handleMouseUp);
                    if (iframe) {
                        iframe.src = "about:blank";
                        iframe.remove();
                        iframe = null;
                    }
                };
                (dock.element as any).__aiBridgeCleanup = cleanup;
                plugin.dockCleanup = cleanup;
            },
            destroy() {
                const cleanup = (this as any)?.element?.__aiBridgeCleanup;
                if (cleanup && typeof cleanup === "function") {
                    cleanup();
                }
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

        const openCodeUrl = document.createElement("input");
        openCodeUrl.type = "text";
        openCodeUrl.className = "b3-text-field fn__block";
        openCodeUrl.value = this.config.openCodeUrl;
        openCodeUrl.placeholder = "https://example.com";
        openCodeUrl.addEventListener("change", async () => {
            this.config.openCodeUrl = openCodeUrl.value;
            await this.saveConfig();
            showMessage(this.i18n.restartRequired ?? "Please restart plugin to apply changes");
        });
        addRow(this.i18n.openCodeUrl ?? "AI Agent Web URL", this.i18n.openCodeUrlDesc, openCodeUrl);
    }
}
