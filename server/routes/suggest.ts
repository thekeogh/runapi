import { Hono } from 'hono';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const suggestRoute = new Hono();

const ignoredDirs = new Set([
  '.codex',
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules'
]);

const sourceExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx'
]);

async function isDirectory(filePath: string): Promise<boolean> {
  return Boolean(await stat(filePath).then((entry) => entry.isDirectory()).catch(() => false));
}

async function serviceSuggestions(query: string): Promise<string[]> {
  const expanded = query.trim().replace(/^~(?=\/|$)/, process.env.HOME ?? '~');
  const input = expanded || process.env.HOME || '/';
  const directory = input.endsWith(path.sep) ? input : path.dirname(input);
  const basename = input.endsWith(path.sep) ? '' : path.basename(input).toLowerCase();
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !basename || entry.name.toLowerCase().includes(basename))
    .slice(0, 40)
    .map((entry) => path.join(directory, entry.name));
}

async function walkFiles(baseRoot: string, currentRoot: string, query: string, results: string[]): Promise<void> {
  if (results.length >= 80) return;

  const entries = await readdir(currentRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (results.length >= 80) return;
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        await walkFiles(baseRoot, path.join(currentRoot, entry.name), query, results);
      }
      continue;
    }
    if (!entry.isFile()) continue;

    const absolute = path.join(currentRoot, entry.name);
    const relative = path.relative(baseRoot, absolute);
    if (!sourceExtensions.has(path.extname(entry.name))) continue;
    if (!query || relative.toLowerCase().includes(query)) {
      results.push(relative);
    }
  }
}

suggestRoute.get('/suggest/services', async (c) => {
  const query = c.req.query('q') ?? '';
  return c.json({ suggestions: await serviceSuggestions(query) });
});

suggestRoute.get('/suggest/files', async (c) => {
  const serviceRoot = path.resolve(c.req.query('serviceRoot') ?? '');
  const query = (c.req.query('q') ?? '').trim().toLowerCase();

  if (!serviceRoot || !(await isDirectory(serviceRoot))) {
    return c.json({ suggestions: [] });
  }

  const results: string[] = [];
  await walkFiles(serviceRoot, serviceRoot, query, results);
  return c.json({ suggestions: results.slice(0, 60) });
});
