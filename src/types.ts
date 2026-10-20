export type DisplayDetail = 'compact' | 'balanced' | 'full';

export interface Settings {
  command: string;
  argsText: string;
  nodePath: string;
  profile: string;
  home: string;
  cwd: string;
  model: string;
  provider: string;
  reasoningEffort: string;
  displayDetail: DisplayDetail;
  mcpEnabled: boolean;
  mcpUrl: string;
  mcpToken: string;
}
export interface ModelChoice {
  provider: string; id: string; name: string; providerName: string;
  reasoning?: string[]; defaultReasoning?: string;
}
export interface NoteReference { id: string; title: string; text?: string; kind?: 'document' | 'block' | 'selection' | 'notebook'; truncated?: boolean }
export interface ToolActivity { id: string; name: string; status: 'running' | 'completed' | 'error'; text?: string }
export interface Message {
  id: string; role: 'user' | 'assistant' | 'system'; text: string; time: number;
  reasoning?: string; streaming?: boolean; interrupted?: boolean; tools?: ToolActivity[];
  seq?: number; turn?: number; step?: number;
}
export interface Chat {
  id: string; title: string; sessionId: string; messages: Message[];
  references: NoteReference[]; updatedAt: number;
  runtimeKey?: string;
  started?: boolean;
}
export interface State {
  settings: Settings; chats: Chat[]; activeChatId: string;
  models: ModelChoice[]; modelsLoading: boolean; modelsError: string;
  busy: boolean; connected: boolean; status: string; error: string; logs: string[];
}
export interface Host {
  loadData(name: string): Promise<any>;
  saveData(name: string, value: unknown): Promise<any>;
  getCurrentNote(): Promise<NoteReference>;
  getSelection(): Promise<NoteReference>;
  appendToNote(text: string): Promise<boolean>;
  notify(message: string): void;
  chooseWorkingDirectory?(): Promise<string | undefined>;
  getWorkspaceDirectory?(): string;
  getReference?(id: string): Promise<NoteReference>;
  getNotebookReference?(id: string): Promise<NoteReference>;
}
