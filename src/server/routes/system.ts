import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

const router = Router();

router.post('/open-folder', (req: Request, res: Response) => {
  const { path: folderPath } = req.body;

  if (!folderPath || typeof folderPath !== 'string') {
    return res.status(400).json({ ok: false, error: 'path is required' });
  }

  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return res.status(404).json({ ok: false, error: 'Directory not found' });
  }

  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === 'win32') {
    cmd = 'explorer';
    args = [resolved];
  } else if (platform === 'darwin') {
    cmd = 'open';
    args = [resolved];
  } else {
    cmd = 'xdg-open';
    args = [resolved];
  }

  execFile(cmd, args, (err) => {
    if (err) return res.status(500).json({ ok: false, error: 'Failed to open folder' });
    res.json({ ok: true });
  });
});

export default router;
