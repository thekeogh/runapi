import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRoute } from './routes/execute.js';
import { inspectRoute } from './routes/inspect.js';
import { signatureRoute } from './routes/signature.js';
import { suggestRoute } from './routes/suggest.js';

const app = new Hono();
const port = Number(process.env.PORT ?? 7778);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(__dirname, '../../dist');

app.use(logger());
app.route('/api', executeRoute);
app.route('/api', inspectRoute);
app.route('/api', signatureRoute);
app.route('/api', suggestRoute);
app.use('/assets/*', serveStatic({ root: distRoot }));
app.get('/favicon.svg', serveStatic({ path: path.join(distRoot, 'favicon.svg') }));
app.get('/favicon.ico', (c) => c.redirect('/favicon.svg'));
app.get('*', serveStatic({ path: path.join(distRoot, 'index.html') }));

serve({ fetch: app.fetch, port }, () => {
  const url = `http://localhost:${port}`;
  console.log(`RunAPI is running at ${url}`);
  if (!process.env.RUNAPI_NO_OPEN) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', url] : [url];
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  }
});
