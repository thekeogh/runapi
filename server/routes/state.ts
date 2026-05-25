import { Hono } from 'hono';
import { stat } from 'node:fs/promises';
import path from 'node:path';

export const stateRoute = new Hono();

stateRoute.get('/state/file', async (c) => {
  const serviceRoot = path.resolve(c.req.query('serviceRoot') ?? '');
  const targetFile = c.req.query('targetFile') ?? '';

  if (!serviceRoot || !targetFile.trim()) {
    return c.json({ exists: false, mtimeMs: null });
  }

  const filePath = path.isAbsolute(targetFile)
    ? targetFile
    : path.resolve(serviceRoot, targetFile);
  const entry = await stat(filePath).catch(() => null);

  return c.json({
    exists: Boolean(entry?.isFile()),
    mtimeMs: entry?.isFile() ? entry.mtimeMs : null
  });
});
