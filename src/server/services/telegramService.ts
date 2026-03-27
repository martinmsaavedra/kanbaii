import https from 'https';
import { getSection } from './settingsService';

/**
 * Send a message via Telegram Bot API.
 * Only sends if telegram integration is enabled in settings.
 */
export async function sendMessage(text: string): Promise<boolean> {
  const config = getSection('integrations').telegram;
  if (!config.enabled || !config.botToken || !config.chatId) return false;

  return new Promise((resolve) => {
    const data = JSON.stringify({ chat_id: config.chatId, text, parse_mode: 'Markdown' });

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${config.botToken}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.write(data);
    req.end();
  });
}

/**
 * Notify about Ralph events.
 */
export function notifyRalphStarted(projectSlug: string, taskCount: number): void {
  sendMessage(`🚀 *Ralph started* on \`${projectSlug}\`\n${taskCount} tasks to execute`).catch(() => {});
}

export function notifyRalphCompleted(projectSlug: string, completed: number, failed: number): void {
  const emoji = failed > 0 ? '⚠️' : '✅';
  sendMessage(`${emoji} *Ralph finished* on \`${projectSlug}\`\n✓ ${completed} done | ✗ ${failed} failed`).catch(() => {});
}

export function notifyTeamsStarted(projectSlug: string, wiCount: number): void {
  sendMessage(`👥 *Teams started* on \`${projectSlug}\`\n${wiCount} work items`).catch(() => {});
}

export function notifyError(projectSlug: string, message: string): void {
  sendMessage(`🔴 *Error* on \`${projectSlug}\`\n${message}`).catch(() => {});
}
