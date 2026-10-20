import type { DisplayDetail, Message, ToolActivity } from '../types';

export interface AssistantActivity {
  id: string;
  messages: Message[];
  active: boolean;
  unsettled: boolean;
  hasIssue: boolean;
  hasProcess: boolean;
  toolCount: number;
  summary: string;
}

/** Adjacent assistant steps belong to one turn; user/system messages end that turn. */
export function groupAssistantActivity(messages: Message[], busy: boolean): Map<string, AssistantActivity> {
  const groups: AssistantActivity[] = [];
  let group: AssistantActivity | undefined;
  for (const message of messages) {
    if (message.role !== 'assistant') { group = undefined; continue; }
    if (!group) {
      group = { id: message.id, messages: [], active: false, unsettled: false, hasIssue: false, hasProcess: false, toolCount: 0, summary: '' };
      groups.push(group);
    }
    group.messages.push(message);
  }
  const lookup = new Map<string, AssistantActivity>();
  for (const item of groups) {
    const tools = new Map<string, ToolActivity>();
    for (const message of item.messages) for (const tool of message.tools || []) tools.set(tool.id, tool);
    const list = [...tools.values()];
    const stopped = item.messages.some(message => message.interrupted);
    const thinking = item.messages.some(message => message.streaming && message.reasoning && !message.text);
    const pending = [...list].reverse().find(tool => tool.status === 'running');
    const errors = list.filter(tool => tool.status === 'error').length;
    item.active = busy && item.messages.at(-1) === messages.at(-1);
    item.unsettled = !item.active && !stopped && Boolean(pending || item.messages.some(message => message.streaming));
    item.hasIssue = stopped || errors > 0 || item.unsettled;
    item.hasProcess = list.length > 0 || item.messages.some(message => message.reasoning || message.streaming || message.interrupted);
    item.toolCount = list.length;
    item.summary = item.active
      ? pending ? `执行中 · ${pending.name}` : thinking ? '思考中' : errors ? '继续处理中 · 有工具未完成' : '生成中'
      : stopped ? '已停止' : item.unsettled ? '未确认完成' : errors ? `${errors} 项工具未完成` : '查看过程';
    for (const message of item.messages) lookup.set(message.id, item);
  }
  return lookup;
}

export function activityPresentation(detail: DisplayDetail, group: AssistantActivity) {
  return {
    grouped: detail === 'compact' || detail === 'balanced' && !group.active,
    phase: group.active ? 'running' : group.hasIssue ? 'issue' : 'settled',
    defaultOpen: detail === 'balanced' && group.hasIssue,
  };
}
