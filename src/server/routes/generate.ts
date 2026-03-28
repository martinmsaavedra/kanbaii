import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';

const router = Router();

/**
 * Spawn Claude CLI and get a response.
 * Pipes the prompt via stdin to avoid shell escaping issues with long prompts.
 */
function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Claude CLI exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });

    // Write prompt via stdin and close
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// POST /api/generate/plan
router.post('/plan', async (req: Request, res: Response) => {
  const { category, prompt, linkedWorkItem } = req.body;

  if (!prompt) {
    return res.status(400).json({ ok: false, error: 'Prompt is required' });
  }

  const categoryLabel = category === 'bug' ? 'Bug Fix' : category === 'refactor' ? 'Refactor' : 'Feature';

  const claudePrompt = `You are a senior software architect. Generate a structured implementation plan for the following ${categoryLabel.toLowerCase()}.

User request: ${prompt}
${linkedWorkItem ? `Context: This is linked to work item: ${linkedWorkItem}` : ''}

Output ONLY the plan in markdown format with:
## Objective
(1-2 sentences)

## Steps
1. Step one
2. Step two
...

## Considerations
- Key consideration 1
- Key consideration 2

Be concise and actionable. No preamble, no explanations outside the plan.`;

  try {
    const plan = await callClaude(claudePrompt);
    console.log('[generate/plan] Claude CLI succeeded');
    res.json({ ok: true, data: { plan, source: 'claude' } });
  } catch (err) {
    const reason = (err as Error).message;
    console.warn('[generate/plan] Claude CLI failed:', reason);
    const plan = `## Objective\n${prompt}\n\n## Steps\n1. Analyze requirements and existing codebase\n2. Design the solution architecture\n3. Implement core functionality\n4. Write comprehensive tests\n5. Code review and refinement\n\n## Considerations\n- Follow existing code patterns\n- Ensure backward compatibility\n- Add error handling`;
    res.json({ ok: true, data: { plan, source: 'fallback', reason } });
  }
});

// POST /api/generate/tasks
router.post('/tasks', async (req: Request, res: Response) => {
  const { category, prompt, plan } = req.body;

  if (!plan && !prompt) {
    return res.status(400).json({ ok: false, error: 'Plan or prompt is required' });
  }

  const claudePrompt = `You are a task decomposition expert. Given this plan, generate a JSON array of development tasks.

Plan:
${plan || prompt}

Output ONLY a valid JSON array (no markdown fences, no explanation) where each task has:
- "title": string (concise, action-oriented, max 80 chars)
- "description": string (1-2 sentences of context, can be empty)
- "model": "sonnet" (default) or "opus" (for complex tasks) or "haiku" (for simple tasks)
- "priority": "low" | "medium" | "high" | "urgent"
- "tags": string[] (relevant tags like "backend", "frontend", "testing", etc.)

Order tasks by execution order (dependencies first). Generate 3-8 tasks.`;

  try {
    const raw = await callClaude(claudePrompt);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const tasks = JSON.parse(jsonMatch[0]);
      console.log(`[generate/tasks] Claude CLI succeeded — ${tasks.length} tasks`);
      res.json({ ok: true, data: { tasks, source: 'claude' } });
    } else {
      throw new Error('No JSON array found in Claude response');
    }
  } catch (err) {
    const reason = (err as Error).message;
    console.warn('[generate/tasks] Claude CLI failed:', reason);
    const source = plan || prompt;
    const lines = source.split('\n').filter((l: string) => /^\d+\.\s/.test(l.trim()));
    const tasks = lines.length > 0
      ? lines.map((line: string) => ({
          title: line.replace(/^\d+\.\s*/, '').trim(),
          description: '',
          model: 'sonnet',
          priority: 'medium',
          tags: category ? [category] : [],
        }))
      : [{ title: prompt?.substring(0, 80) || 'Implement solution', description: '', model: 'sonnet', priority: 'medium', tags: [] }];

    res.json({ ok: true, data: { tasks, source: 'fallback', reason } });
  }
});

export default router;
