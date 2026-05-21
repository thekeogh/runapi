import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const inspectRoute = new Hono();

type InspectBody = {
  envMode?: 'local' | 'test' | 'none';
  serviceRoot?: string;
  targetFile?: string;
};

function envArgs(envMode: InspectBody['envMode']): string[] {
  if (envMode === 'none') return [];
  if (envMode === 'test') return ['--env-file-if-exists=.test.env'];
  return ['--env-file-if-exists=.local.env', '--env-file-if-exists=.override.env'];
}

async function writeTempRunner(content: string): Promise<string> {
  const projectDir = path.join(process.cwd(), '.codex', 'temp', 'runapi-inspect');
  await mkdir(projectDir, { recursive: true });
  const filePath = path.join(projectDir, `inspect-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

function targetUrl(serviceRoot: string, targetFile: string): string {
  const filePath = path.isAbsolute(targetFile)
    ? targetFile
    : path.resolve(serviceRoot, targetFile);
  return pathToFileURL(filePath).href;
}

function runnerSource(fileUrl: string): string {
  return `
try {
  const module = await import(${JSON.stringify(fileUrl)});
  const exports = Object.entries(module).map(([name, value]) => {
    const methods = [];
    if (value && typeof value === 'object') {
      const proto = Object.getPrototypeOf(value);
      if (proto) {
        methods.push(...Object.getOwnPropertyNames(proto).filter((key) => key !== 'constructor' && typeof value[key] === 'function'));
      }
      methods.push(...Object.keys(value).filter((key) => typeof value[key] === 'function'));
    }
    return { name, type: typeof value, methods: [...new Set(methods)].sort() };
  });
  process.stdout.write(JSON.stringify({ exports }));
} catch (error) {
  process.stderr.write(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
`;
}

inspectRoute.post('/inspect', async (c) => {
  const body = await c.req.json<InspectBody>();
  const serviceRoot = path.resolve(body.serviceRoot ?? '');
  const targetFile = body.targetFile ?? '';

  if (!body.serviceRoot?.trim()) {
    return c.json({ error: 'Enter a service root first.' }, 400);
  }
  if (!targetFile.trim()) {
    return c.json({ error: 'Enter a target file first.' }, 400);
  }

  const runnerPath = await writeTempRunner(runnerSource(targetUrl(serviceRoot, targetFile)));
  const result = await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
    const child = spawn(process.execPath, [
      ...envArgs(body.envMode),
      '--import',
      'tsx',
      runnerPath
    ], {
      cwd: serviceRoot,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (exitCode) => resolve({ stdout, stderr, exitCode }));
    child.on('error', (error) => resolve({ stdout, stderr: error.stack ?? error.message, exitCode: 1 }));
  });

  if (result.exitCode !== 0) {
    return c.json({ error: result.stderr || 'Inspection failed.' }, 400);
  }

  return c.json(JSON.parse(result.stdout) as unknown);
});
