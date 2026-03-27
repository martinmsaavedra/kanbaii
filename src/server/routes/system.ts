import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import fs from 'fs';

const router = Router();

// POST /api/open-folder — Open a folder in the system file explorer
router.post('/open-folder', (req: Request, res: Response) => {
  const { path: folderPath } = req.body;

  if (!folderPath) {
    return res.status(400).json({ ok: false, error: 'path is required' });
  }

  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ ok: false, error: 'Path does not exist' });
  }

  const platform = process.platform;
  let cmd: string;

  if (platform === 'win32') {
    cmd = `explorer "${folderPath}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${folderPath}"`;
  } else {
    cmd = `xdg-open "${folderPath}"`;
  }

  exec(cmd, (err) => {
    if (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
    res.json({ ok: true });
  });
});

export default router;
