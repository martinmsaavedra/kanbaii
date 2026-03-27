import { Router, Request, Response } from 'express';
import express from 'express';
import https from 'https';
import { getSection } from '../services/settingsService';

const router = Router();

// POST /api/voice/transcribe — receive raw audio, send to OpenAI Whisper
router.post('/transcribe', express.raw({ type: '*/*', limit: '10mb' }), (req: Request, res: Response) => {
  const apiKey = (getSection('integrations').voice as any)?.openaiApiKey;
  if (!apiKey) {
    return res.status(400).json({ ok: false, error: 'OpenAI API key not configured. Set it in Settings > Integrations > Voice.' });
  }

  const audioBuffer = req.body as Buffer;
  if (!audioBuffer || audioBuffer.length === 0) {
    return res.status(400).json({ ok: false, error: 'No audio data received' });
  }

  const boundary = '----KanbaiiVoice' + Date.now();
  const audioType = (req.headers['x-audio-type'] as string) || 'audio/webm';
  const ext = audioType.includes('wav') ? 'wav' : audioType.includes('mp4') ? 'mp4' : 'webm';

  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.${ext}"\r\nContent-Type: ${audioType}\r\n\r\n`));
  parts.push(audioBuffer);
  parts.push(Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`));
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const apiReq = https.request({
    hostname: 'api.openai.com',
    path: '/v1/audio/transcriptions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
  }, (apiRes) => {
    let data = '';
    apiRes.on('data', (c: Buffer) => data += c);
    apiRes.on('end', () => {
      try {
        const result = JSON.parse(data);
        if (result.text) {
          res.json({ ok: true, data: { text: result.text } });
        } else {
          res.status(500).json({ ok: false, error: result.error?.message || 'Transcription failed' });
        }
      } catch {
        res.status(500).json({ ok: false, error: 'Failed to parse Whisper response' });
      }
    });
  });

  apiReq.on('error', (err) => {
    res.status(500).json({ ok: false, error: `Whisper API error: ${err.message}` });
  });
  apiReq.setTimeout(30000, () => { apiReq.destroy(); res.status(504).json({ ok: false, error: 'Timeout' }); });
  apiReq.write(body);
  apiReq.end();
});

export default router;
