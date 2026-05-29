import { Hono } from 'hono';
import { watch } from 'node:fs';
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

stateRoute.get('/state/file/watch', async (c) => {
  const serviceRoot = path.resolve(c.req.query('serviceRoot') ?? '');
  const targetFile = c.req.query('targetFile') ?? '';

  if (!serviceRoot || !targetFile.trim()) {
    return c.text('Missing serviceRoot or targetFile', 400);
  }

  const filePath = path.isAbsolute(targetFile)
    ? targetFile
    : path.resolve(serviceRoot, targetFile);
  const directory = path.dirname(filePath);
  const basename = path.basename(filePath);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const initial = await stat(filePath).catch(() => null);
      send('ready', {
        exists: Boolean(initial?.isFile()),
        mtimeMs: initial?.isFile() ? initial.mtimeMs : null
      });

      const watcher = watch(directory, async (_eventType, filename) => {
        if (filename && filename.toString() !== basename) return;
        const entry = await stat(filePath).catch(() => null);
        send('change', {
          exists: Boolean(entry?.isFile()),
          mtimeMs: entry?.isFile() ? entry.mtimeMs : null
        });
      });

      c.req.raw.signal.addEventListener('abort', () => {
        closed = true;
        watcher.close();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
});
