export interface PlannerTask {
  title: string;
  description: string;
  model: string;
  priority: string;
  tags: string[];
}

export interface PlannerDiscoveredItem {
  id: string;
  title: string;
  category: 'feature' | 'bug' | 'refactor';
  status: 'identified' | 'planning' | 'ready';
  plan: string | null;
  tasks: PlannerTask[];
  approvedAs: string | null;
}

export interface PlannerMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'escalation';
  content: string;
  options?: string[];
  respondedWith?: string;
  timestamp: string;
}

export interface PlannerState {
  active: boolean;
  projectSlug: string | null;
  messages: PlannerMessage[];
  discoveredItems: PlannerDiscoveredItem[];
  startedAt: string | null;
}

const IDLE: PlannerState = {
  active: false,
  projectSlug: null,
  messages: [],
  discoveredItems: [],
  startedAt: null,
};

class PlannerStore {
  private state: PlannerState = { ...IDLE };

  getState(): PlannerState {
    return { ...this.state, messages: [...this.state.messages], discoveredItems: [...this.state.discoveredItems] };
  }

  start(projectSlug: string, userPrompt: string): void {
    this.state = {
      active: true,
      projectSlug,
      messages: [{
        id: `msg-${Date.now()}`,
        role: 'user',
        content: userPrompt,
        timestamp: new Date().toISOString(),
      }],
      discoveredItems: [],
      startedAt: new Date().toISOString(),
    };
  }

  stop(): void {
    this.state.active = false;
  }

  reset(): void {
    this.state = { ...IDLE };
  }

  isActive(): boolean {
    return this.state.active;
  }

  addMessage(role: 'user' | 'assistant' | 'system' | 'escalation', content: string, options?: string[]): PlannerMessage {
    const msg: PlannerMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      role,
      content,
      options,
      timestamp: new Date().toISOString(),
    };
    this.state.messages.push(msg);
    return msg;
  }

  setEscalationResponse(messageId: string, response: string): void {
    const msg = this.state.messages.find(m => m.id === messageId);
    if (msg) msg.respondedWith = response;
  }

  addDiscoveredItem(item: { id: string; title: string; category: 'feature' | 'bug' | 'refactor' }): PlannerDiscoveredItem {
    const disc: PlannerDiscoveredItem = {
      id: item.id,
      title: item.title,
      category: item.category,
      status: 'identified',
      plan: null,
      tasks: [],
      approvedAs: null,
    };
    this.state.discoveredItems.push(disc);
    return disc;
  }

  updateItem(id: string, data: { status?: 'identified' | 'planning' | 'ready'; plan?: string; tasks?: PlannerTask[]; title?: string }): PlannerDiscoveredItem | null {
    const item = this.state.discoveredItems.find(i => i.id === id);
    if (!item) return null;
    if (data.status) item.status = data.status;
    if (data.plan !== undefined) item.plan = data.plan;
    if (data.tasks) item.tasks = data.tasks;
    if (data.title) item.title = data.title;
    return item;
  }

  getItem(id: string): PlannerDiscoveredItem | null {
    return this.state.discoveredItems.find(i => i.id === id) || null;
  }

  markApproved(id: string, workItemSlug: string): void {
    const item = this.state.discoveredItems.find(i => i.id === id);
    if (item) item.approvedAs = workItemSlug;
  }

  removeItem(id: string): void {
    this.state.discoveredItems = this.state.discoveredItems.filter(i => i.id !== id);
  }
}

export const plannerStore = new PlannerStore();
