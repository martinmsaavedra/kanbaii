import https from 'https';
import { getSection } from './settingsService';

// ─── Telegram Bot API helpers ───

function apiCall(method: string, body: any): Promise<any> {
  const config = getSection('integrations').telegram;
  if (!config.enabled || !config.botToken) return Promise.resolve(null);

  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${config.botToken}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

// ─── Send messages ───

export async function sendMessage(text: string): Promise<boolean> {
  const config = getSection('integrations').telegram;
  if (!config.enabled || !config.botToken || !config.chatId) return false;
  const result = await apiCall('sendMessage', { chat_id: config.chatId, text, parse_mode: 'Markdown' });
  return result?.ok || false;
}

export async function sendMessageWithReplyKeyboard(text: string, options: string[]): Promise<number | null> {
  const config = getSection('integrations').telegram;
  if (!config.enabled || !config.botToken || !config.chatId) return null;

  const keyboard = options.length > 0
    ? { reply_markup: { keyboard: [options.map(o => ({ text: o }))], one_time_keyboard: true, resize_keyboard: true } }
    : {};

  const result = await apiCall('sendMessage', { chat_id: config.chatId, text, parse_mode: 'Markdown', ...keyboard });
  return result?.result?.message_id || null;
}

// ─── Poll for replies ───

let lastUpdateId = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let onReplyCallback: ((text: string) => void) | null = null;

async function pollUpdates(): Promise<void> {
  const config = getSection('integrations').telegram;
  if (!config.enabled || !config.botToken) return;

  const result = await apiCall('getUpdates', {
    offset: lastUpdateId + 1,
    timeout: 0,
    allowed_updates: ['message'],
  });

  if (!result?.ok || !result.result?.length) return;

  for (const update of result.result) {
    lastUpdateId = update.update_id;

    if (update.message?.text && update.message.chat?.id?.toString() === config.chatId) {
      const text = update.message.text;
      if (onReplyCallback) {
        onReplyCallback(text);
        onReplyCallback = null;
        stopPolling();
        // Remove keyboard
        apiCall('sendMessage', {
          chat_id: config.chatId,
          text: `✓ Response received: _${text.slice(0, 50)}_`,
          parse_mode: 'Markdown',
          reply_markup: { remove_keyboard: true },
        });
      }
    }
  }
}

function startPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(pollUpdates, 2000);
}

function stopPolling(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/**
 * Wait for a reply from Telegram. Returns the text when received.
 * Resolves with null on timeout.
 */
export function waitForTelegramReply(timeoutMs: number = 1800000): Promise<string | null> {
  return new Promise((resolve) => {
    onReplyCallback = (text: string) => {
      clearTimeout(timer);
      resolve(text);
    };
    startPolling();

    const timer = setTimeout(() => {
      onReplyCallback = null;
      stopPolling();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Check if we're currently waiting for a Telegram reply.
 */
export function isWaitingForReply(): boolean {
  return onReplyCallback !== null;
}

// ─── Notification helpers ───

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
