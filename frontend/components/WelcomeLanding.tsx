'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Sparkles, Layers, LayoutGrid, Bot, Users, Zap, ArrowDown, Terminal, ArrowRight } from 'lucide-react';

/* ═══════════════════════════════════════════
   Expandable Section
   ═══════════════════════════════════════════ */

function Section({
  icon,
  title,
  subtitle,
  accentColor,
  children,
  defaultOpen = false,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  accentColor: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={`rounded-lg border transition-all duration-250 ease-out-expo overflow-hidden flex flex-col
                  ${open
                    ? 'border-border-light bg-surface/80 shadow-card'
                    : 'border-border/50 bg-surface/30 hover:border-border/80 hover:bg-surface/50'}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className={`flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${accentColor}`}>
          {icon}
        </div>
        <div className="flex flex-col gap-0 min-w-0 flex-1">
          <span className="text-sm font-medium text-text">{title}</span>
          <span className="text-xs text-text-muted leading-snug">{subtitle}</span>
        </div>
        <ChevronDown
          size={14}
          className={`text-text-muted/40 shrink-0 transition-transform duration-250 ease-out-expo
                      ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`grid transition-all duration-250 ease-out-expo
                    ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Mini Kanban Visual
   ═══════════════════════════════════════════ */

function MiniCard({ label, color }: { label: string; color: string }) {
  return (
    <div className={`px-2.5 py-1 rounded text-[11px] font-medium border truncate ${color}`}>
      {label}
    </div>
  );
}

function MiniColumn({ title, children, highlight }: { title: string; children?: ReactNode; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      <div className={`text-[10px] font-mono uppercase tracking-wider text-center pb-0.5 border-b mb-0.5
                       ${highlight ? 'text-accent border-accent/30' : 'text-text-muted/40 border-border/40'}`}>
        {title}
      </div>
      <div className="flex flex-col gap-1">
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Section: The Point
   ═══════════════════════════════════════════ */

function WhenToUseWhat() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5">
        {/* Claude Code */}
        <div className="rounded-md border border-border/40 bg-bg/50 p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <Terminal size={12} className="text-text-muted/50" />
            <span className="text-[11px] font-mono font-medium text-text-secondary">Claude Code</span>
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-text-muted leading-relaxed">
            <span>&ldquo;Fix this bug&rdquo;</span>
            <span>&ldquo;Refactor this function&rdquo;</span>
            <span>&ldquo;Explain this code&rdquo;</span>
            <span>&ldquo;Write tests for X&rdquo;</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-border/30 text-[10px] font-mono text-text-muted/40">
            One task, one session
          </div>
        </div>

        {/* KANBAII */}
        <div className="rounded-md border border-accent/30 bg-accent/[0.03] p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-accent text-[13px]">&#x25C7;</span>
            <span className="text-[11px] font-mono font-medium text-accent">KANBAII</span>
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-text-secondary leading-relaxed">
            <span>&ldquo;Build the auth system&rdquo;</span>
            <span>&ldquo;8 bugs to triage this week&rdquo;</span>
            <span>&ldquo;MVP with 15 features&rdquo;</span>
            <span>&ldquo;Track sprint progress&rdquo;</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-accent/20 text-[10px] font-mono text-accent/40">
            Many tasks, full visibility
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 py-1">
        <div className="h-px flex-1 bg-border/30" />
        <span className="text-[10px] font-mono text-text-muted/40 px-2">They work together</span>
        <div className="h-px flex-1 bg-border/30" />
      </div>

      <div className="flex items-center justify-center gap-3 text-[11px] text-text-muted font-mono">
        <span className="text-text-secondary">You organize in KANBAII</span>
        <ArrowRight size={10} className="text-accent/40" />
        <span className="text-text-secondary">KANBAII sends tasks to Claude Code</span>
        <ArrowRight size={10} className="text-accent/40" />
        <span className="text-text-secondary">Results come back to the board</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Section: Hierarchy
   ═══════════════════════════════════════════ */

function HierarchyExample() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0 rounded-md border border-border/40 bg-bg/50 p-3 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-accent">&#x25C7;</span>
          <span className="text-text font-medium">My Startup MVP</span>
          <span className="text-text-muted/40 ml-auto text-[11px]">project</span>
        </div>
        <div className="ml-3 border-l border-border/30 pl-3 mt-1.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-feature" />
            <span className="text-text-secondary">User Authentication</span>
            <span className="text-text-muted/30 ml-auto text-[11px]">feature</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-feature" />
            <span className="text-text-secondary">Payment Integration</span>
            <span className="text-text-muted/30 ml-auto text-[11px]">feature</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-bug" />
            <span className="text-text-secondary">Login 500 error</span>
            <span className="text-text-muted/30 ml-auto text-[11px]">bug</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-refactor" />
            <span className="text-text-secondary">Cleanup API routes</span>
            <span className="text-text-muted/30 ml-auto text-[11px]">refactor</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-text-muted leading-relaxed text-center">
        Each work item has its own plan, tasks, and kanban board.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Section: Kanban Boards
   ═══════════════════════════════════════════ */

function KanbanExample() {
  return (
    <div className="flex flex-col gap-3">
      {/* Level 1 */}
      <div>
        <div className="text-[11px] font-mono text-text-muted/40 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Layers size={9} />
          Level 1 — Work Items
        </div>
        <div className="flex gap-1.5 rounded-md border border-border/40 bg-bg/50 p-2.5">
          <MiniColumn title="Planning">
            <MiniCard label="Payment" color="text-feature bg-feature/10 border-feature/20" />
          </MiniColumn>
          <MiniColumn title="Active" highlight>
            <MiniCard label="User Auth" color="text-feature bg-feature/10 border-feature/20" />
            <MiniCard label="Login 500" color="text-bug bg-bug/10 border-bug/20" />
          </MiniColumn>
          <MiniColumn title="Review">
            <MiniCard label="Cleanup API" color="text-refactor bg-refactor/10 border-refactor/20" />
          </MiniColumn>
          <MiniColumn title="Done" />
        </div>
      </div>

      {/* Arrow down */}
      <div className="flex items-center justify-center">
        <ArrowDown size={12} className="text-text-muted/20" />
      </div>

      {/* Level 2 */}
      <div>
        <div className="text-[11px] font-mono text-text-muted/40 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <LayoutGrid size={9} />
          Level 2 — Tasks inside &quot;User Auth&quot;
        </div>
        <div className="flex gap-1 rounded-md border border-accent/20 bg-accent/[0.02] p-2.5">
          <MiniColumn title="Backlog">
            <MiniCard label="OAuth" color="text-text-muted bg-surface border-border/40" />
          </MiniColumn>
          <MiniColumn title="Todo">
            <MiniCard label="DB schema" color="text-text-muted bg-surface border-border/40" />
          </MiniColumn>
          <MiniColumn title="Doing" highlight>
            <MiniCard label="JWT" color="text-text-muted bg-surface border-border/40" />
          </MiniColumn>
          <MiniColumn title="Review">
            <MiniCard label="Login form" color="text-text-muted bg-surface border-border/40" />
          </MiniColumn>
          <MiniColumn title="Done">
            <MiniCard label="User model" color="text-text-muted/40 bg-transparent border-border/20" />
          </MiniColumn>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Section: AI Wizard
   ═══════════════════════════════════════════ */

function WizardExample() {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-border/40 bg-bg/50 overflow-hidden">
        {/* User prompt */}
        <div className="px-3 py-2.5 border-b border-border/30 flex items-start gap-2.5">
          <div className="w-1 h-full min-h-[16px] rounded-full bg-accent/40 shrink-0 mt-0.5" />
          <span className="text-xs text-text-secondary italic leading-relaxed">
            &quot;I need user auth with login, signup, password reset, and OAuth for Google & GitHub&quot;
          </span>
        </div>

        {/* AI output: plan + tasks side by side */}
        <div className="grid grid-cols-2 divide-x divide-border/20">
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-warning/60 mb-1.5">
              <Sparkles size={9} />
              Plan generated
            </div>
            <div className="flex flex-col gap-1 text-[11px] text-text-muted leading-relaxed">
              <span>1. Design user model & DB schema</span>
              <span>2. Auth endpoints (JWT-based)</span>
              <span>3. Password reset flow w/ email</span>
              <span>4. OAuth integration</span>
              <span>5. Frontend login/signup forms</span>
            </div>
          </div>
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-success/60 mb-1.5">
              <LayoutGrid size={9} />
              Tasks created
            </div>
            <div className="flex flex-col gap-0.5 text-[11px]">
              {['User model schema', 'Login endpoint', 'Signup endpoint', 'JWT middleware', 'Password reset', 'Google OAuth', 'GitHub OAuth', 'Login page UI'].map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <span className="text-success/50 text-[10px]">&#x2713;</span>
                  <span className="text-text-muted">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-text-muted leading-relaxed text-center">
        Review, edit, approve. Skip any step. Create manually if you prefer.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Section: Ralph
   ═══════════════════════════════════════════ */

function RalphExample() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="rounded-md border border-accent/20 bg-accent/[0.02] p-3 font-mono text-[11px]">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 text-accent font-medium">
            <Bot size={11} />
            Ralph executing &quot;User Auth&quot;
          </div>
          <span className="text-[11px] text-accent/40">3/6 tasks</span>
        </div>
        <div className="flex flex-col gap-1.5 ml-1">
          {[
            { label: 'Read plan for context', status: 'done' },
            { label: 'DB schema → created', status: 'done' },
            { label: 'Login endpoint → created', status: 'done' },
            { label: 'JWT middleware', status: 'running' },
            { label: 'Password reset', status: 'queued' },
            { label: 'OAuth integration', status: 'queued' },
          ].map((task) => (
            <div key={task.label} className={`flex items-center gap-2 ${task.status === 'queued' ? 'opacity-35' : ''}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0
                ${task.status === 'done' ? 'bg-success' : ''}
                ${task.status === 'running' ? 'bg-accent animate-breathe' : ''}
                ${task.status === 'queued' ? 'bg-text-muted/30' : ''}`}
              />
              <span className={task.status === 'running' ? 'text-text-secondary' : 'text-text-muted/60'}>
                {task.label}
              </span>
              <span className={`ml-auto text-[11px]
                ${task.status === 'done' ? 'text-success/50' : ''}
                ${task.status === 'running' ? 'text-accent/50 animate-breathe' : ''}
                ${task.status === 'queued' ? 'text-text-muted/20' : ''}`}>
                {task.status}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-text-muted leading-relaxed text-center">
        One work item, full attention. Sequential and parallel where safe.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Section: Teams
   ═══════════════════════════════════════════ */

function TeamsExample() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="rounded-md border border-success/20 bg-success/[0.02] p-3 font-mono text-[11px]">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 text-success font-medium">
            <Users size={11} />
            Teams — 3 workers active
          </div>
          <span className="text-[11px] text-success/40">parallel</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {[
            { worker: 'Worker 1', item: 'User Auth', type: 'feature', progress: '3/6', running: true },
            { worker: 'Worker 2', item: 'Payment', type: 'feature', progress: '1/4', running: true },
            { worker: 'Worker 3', item: 'Login 500', type: 'bug', progress: '2/2', running: false },
          ].map((w) => (
            <div key={w.worker} className="flex items-center gap-2.5 px-2.5 py-2 rounded bg-surface/50 border border-border/30">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${w.running ? 'bg-accent animate-breathe' : 'bg-success'}`} />
              <span className="text-text-secondary w-16">{w.worker}</span>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${w.type === 'feature' ? 'bg-feature' : 'bg-bug'}`} />
                <span className="text-text-muted truncate">{w.item}</span>
              </div>
              {/* mini progress bar */}
              <div className="w-12 h-1 rounded-full bg-border/30 overflow-hidden">
                <div
                  className={`h-full rounded-full ${w.running ? 'bg-accent/50' : 'bg-success/50'}`}
                  style={{ width: `${(parseInt(w.progress) / parseInt(w.progress.split('/')[1])) * 100}%` }}
                />
              </div>
              <span className={`text-[11px] tabular-nums w-8 text-right ${w.running ? 'text-accent/40' : 'text-success/40'}`}>
                {w.progress}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-text-muted leading-relaxed text-center">
        Multiple work items, multiple workers, all advancing at once.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Main Landing
   ═══════════════════════════════════════════ */

export function WelcomeLanding() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-8 max-w-[920px] w-full mx-auto px-8 py-10 animate-fade-in-up">

        {/* ─── Hero ─── */}
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            <span className="text-[44px] leading-none text-accent opacity-20 animate-breathe select-none">&#x25C7;</span>
            <div className="absolute inset-0 blur-[24px] bg-accent/10 rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[26px] font-semibold text-text tracking-tight">
              The organization layer for Claude Code
            </h1>
            <p className="text-sm text-text-secondary leading-relaxed max-w-lg">
              Claude Code is great at executing one task. KANBAII lets you see the whole project, plan the work, and let AI execute across many tasks at once.
            </p>
          </div>
        </div>

        {/* ─── When to use what ─── */}
        <Section
          icon={<Zap size={14} />}
          title="KANBAII + Claude Code"
          subtitle="Not a replacement — the project layer Claude Code doesn't have"
          accentColor="bg-accent/8 text-accent/60"
          defaultOpen
        >
          <WhenToUseWhat />
        </Section>

        {/* ─── Hierarchy + Kanban side by side ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-stretch">
          <Section
            icon={<Layers size={14} />}
            title="Organize in two levels"
            subtitle="Project → Work Items → Tasks"
            accentColor="bg-accent/8 text-accent/60"
            defaultOpen
          >
            <HierarchyExample />
          </Section>

          <Section
            icon={<LayoutGrid size={14} />}
            title="Every item gets a kanban board"
            subtitle="Drag tasks through Backlog → Done"
            accentColor="bg-feature/10 text-feature/70"
            defaultOpen
          >
            <KanbanExample />
          </Section>
        </div>

        {/* ─── Wizard full width ─── */}
        <Section
          icon={<Sparkles size={14} />}
          title="AI Planner"
          subtitle="Describe what you need → get a structured plan and tasks"
          accentColor="bg-warning/10 text-warning/70"
        >
          <WizardExample />
        </Section>

        {/* ─── Ralph + Teams side by side ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <Section
            icon={<Bot size={14} />}
            title="Ralph — focused executor"
            subtitle="One work item, executed end to end by AI"
            accentColor="bg-accent/8 text-accent/60"
          >
            <RalphExample />
          </Section>

          <Section
            icon={<Users size={14} />}
            title="Teams — parallel execution"
            subtitle="Multiple items, multiple AI workers, at once"
            accentColor="bg-success/10 text-success/70"
          >
            <TeamsExample />
          </Section>
        </div>

        {/* ─── Quick Start ─── */}
        <div className="rounded-lg border border-border/40 bg-surface/30 p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <Terminal size={14} className="text-accent/50" />
            <span className="text-sm font-medium text-text">Quick Start</span>
          </div>
          <div className="font-mono text-[12px] text-text-muted leading-relaxed flex flex-col gap-1">
            <div className="flex gap-3">
              <span className="text-text-muted/30 select-none">$</span>
              <span><span className="text-accent/70">npm</span> install -g kanbaii</span>
            </div>
            <div className="flex gap-3">
              <span className="text-text-muted/30 select-none">$</span>
              <span><span className="text-accent/70">kanbaii</span> doctor</span>
              <span className="text-text-muted/30 ml-4"># verify Claude CLI + auth</span>
            </div>
            <div className="flex gap-3">
              <span className="text-text-muted/30 select-none">$</span>
              <span><span className="text-accent/70">kanbaii</span> start</span>
              <span className="text-text-muted/30 ml-4"># opens this dashboard</span>
            </div>
          </div>
        </div>

        {/* ─── CTA ─── */}
        <div className="flex items-center justify-center gap-2 text-xs text-text-muted font-mono pb-4">
          <Zap size={10} className="text-accent/30" />
          Create a project from the sidebar to begin
        </div>
      </div>
    </div>
  );
}
