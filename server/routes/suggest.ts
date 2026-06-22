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

function normalizeRelativePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\/+/, '');
}

function splitFileQuery(query: string): { directory: string; basename: string } {
  const normalized = normalizeRelativePath(query.trim());
  if (!normalized || normalized.endsWith('/')) {
    return { directory: normalized.replace(/\/+$/, ''), basename: '' };
  }

  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex === -1) {
    return { directory: '', basename: normalized.toLowerCase() };
  }

  return {
    directory: normalized.slice(0, slashIndex),
    basename: normalized.slice(slashIndex + 1).toLowerCase()
  };
}

function childSuggestion(directory: string, entryName: string, isDirectoryEntry: boolean): string {
  const prefix = directory ? `${directory}/` : '';
  return `${prefix}${entryName}${isDirectoryEntry ? '/' : ''}`;
}

async function fileSuggestions(serviceRoot: string, query: string): Promise<string[]> {
  const { directory, basename } = splitFileQuery(query);
  const absoluteDirectory = path.resolve(serviceRoot, directory);
  const relativeDirectory = path.relative(serviceRoot, absoluteDirectory);

  if (relativeDirectory.startsWith('..') || path.isAbsolute(relativeDirectory)) {
    return [];
  }

  const entries = await readdir(absoluteDirectory, { withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => {
      if (entry.isDirectory()) return !ignoredDirs.has(entry.name);
      if (!entry.isFile()) return false;
      return sourceExtensions.has(path.extname(entry.name));
    })
    .filter((entry) => !basename || entry.name.toLowerCase().includes(basename))
    .sort((first, second) => {
      if (first.isDirectory() !== second.isDirectory()) return first.isDirectory() ? -1 : 1;
      return first.name.localeCompare(second.name);
    })
    .slice(0, 60)
    .map((entry) => childSuggestion(directory, entry.name, entry.isDirectory()));
}

suggestRoute.get('/suggest/services', async (c) => {
  const query = c.req.query('q') ?? '';
  return c.json({ suggestions: await serviceSuggestions(query) });
});

suggestRoute.get('/suggest/files', async (c) => {
  const serviceRoot = path.resolve(c.req.query('serviceRoot') ?? '');
  const query = c.req.query('q') ?? '';

  if (!serviceRoot || !(await isDirectory(serviceRoot))) {
    return c.json({ suggestions: [] });
  }

  return c.json({ suggestions: await fileSuggestions(serviceRoot, query) });
});
