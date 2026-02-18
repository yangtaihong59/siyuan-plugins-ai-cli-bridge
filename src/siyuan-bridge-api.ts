export interface APIResponse {
    code: number;
    msg: string;
    data?: any;
}

export class SiYuanAPI {
    private plugin: any;
    constructor(plugin: any) { this.plugin = plugin; }

    async getNotebooks(): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/notebook/lsNotebooks");
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async createNotebook(name: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/notebook/createNotebook", { name });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async renameNotebook(notebookId: string, newName: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/notebook/renameNotebook", { notebook: notebookId, name: newName });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async removeNotebook(notebookId: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/notebook/removeNotebook", { notebook: notebookId });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async openNotebook(notebookId: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/notebook/openNotebook", { notebook: notebookId });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async closeNotebook(notebookId: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/notebook/closeNotebook", { notebook: notebookId });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async getDocsByNotebook(notebookId: string, path: string = "/"): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/filetree/listDocsByPath", { notebook: notebookId, path });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async createDoc(notebookId: string, path: string, markdown: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/filetree/createDocWithMd", { notebook: notebookId, path, markdown });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async getDocContent(docId: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/export/exportMdContent", { id: docId });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async renameDoc(notebookId: string, path: string, newName: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/filetree/renameDoc", { notebook: notebookId, path, newName });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async deleteDoc(notebookId: string, path: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/filetree/removeDoc", { notebook: notebookId, path });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async moveDocs(srcNotebooks: string[], srcPaths: string[], destNotebook: string, destPath: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/filetree/moveDocs", {
                srcs: srcPaths.map((path, index) => ({ notebook: srcNotebooks[index], path })),
                destNotebook, destPath
            });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async getBlockById(blockId: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/block/getBlockInfo", { id: blockId });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async getBlockKramdown(blockId: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/block/getBlockKramdown", { id: blockId });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async insertBlock(parentId: string, dataType: string, data: string, previousId?: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const params: any = { parentID: parentId, dataType, data };
            if (previousId) params.previousID = previousId;
            const response = await fetchSyncPost("/api/block/insertBlock", params);
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async prependBlock(parentId: string, dataType: string, data: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/block/prependBlock", { parentID: parentId, dataType, data });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async appendBlock(parentId: string, dataType: string, data: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/block/appendBlock", { parentID: parentId, dataType, data });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async updateBlock(id: string, dataType: string, data: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/block/updateBlock", { id, dataType, data });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async deleteBlock(id: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/block/deleteBlock", { id });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async moveBlock(id: string, parentId: string, previousId?: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const params: any = { id, parentID: parentId };
            if (previousId) params.previousID = previousId;
            const response = await fetchSyncPost("/api/block/moveBlock", params);
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async foldBlock(blockId: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/block/foldBlock", { id: blockId });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async unfoldBlock(blockId: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/block/unfoldBlock", { id: blockId });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async getBlockAttrs(blockId: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/attr/getBlockAttrs", { id: blockId });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/attr/setBlockAttrs", { id: blockId, attrs });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async searchBlock(query: string, notebook?: string, type?: number): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const params: any = { query };
            if (notebook) params.notebook = notebook;
            if (type !== undefined) params.type = type;
            const response = await fetchSyncPost("/api/search/searchBlock", params);
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async searchEmbedBlock(sql: string, embedBlockId?: string, excludeIDs?: string[]): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const params: any = { stmt: sql };
            if (embedBlockId) params.embedBlockID = embedBlockId;
            if (excludeIDs) params.excludeIDs = excludeIDs;
            const response = await fetchSyncPost("/api/search/searchEmbedBlock", params);
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async querySQL(sql: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/query/sql", { stmt: sql });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async uploadAsset(file: File): Promise<APIResponse> {
        try {
            const formData = new FormData();
            formData.append("file[]", file);
            const response = await fetch("/api/asset/upload", { method: "POST", body: formData });
            const data = await response.json();
            return { code: 0, msg: "Success", data: data.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async getFile(path: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/file/getFile", { path });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async putFile(path: string, file: any, isDir: boolean = false, modTime: number = Date.now()): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/file/putFile", { path, file, isDir, modTime });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async removeFile(path: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/file/removeFile", { path });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async readDir(path: string): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/file/readDir", { path });
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async getSystemConf(): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/system/getConf");
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async version(): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/system/version");
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }

    async getCurrentTime(): Promise<APIResponse> {
        try {
            const { fetchSyncPost } = await import("siyuan");
            const response = await fetchSyncPost("/api/system/currentTime");
            return { code: 0, msg: "Success", data: response.data };
        } catch (error: any) { return { code: -1, msg: error.message }; }
    }
}
