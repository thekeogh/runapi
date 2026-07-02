import { build } from 'esbuild';
import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RunEvent } from '../lib/types.js';

export const executeRoute = new Hono();

type ExecuteMode = 'method' | 'snippet';

type ExecuteBody = {
  argsJson?: string;
  code?: string;
  envMode?: 'local' | 'test' | 'none';
  exportName?: string;
  methodName?: string;
  mode?: ExecuteMode;
  serviceRoot?: string;
  targetFile?: string;
};

function encodeEvent(event: RunEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function serviceFileUrl(serviceRoot: string, targetFile: string): string {
  const filePath = path.isAbsolute(targetFile)
    ? targetFile
    : path.resolve(serviceRoot, targetFile);
  return pathToFileURL(filePath).href;
}

function envArgs(envMode: ExecuteBody['envMode']): string[] {
  if (envMode === 'none') return [];
  if (envMode === 'test') {
    return ['--env-file-if-exists=.test.env'];
  }
  return ['--env-file-if-exists=.local.env', '--env-file-if-exists=.override.env'];
}

function runnerSource(input: Required<Pick<ExecuteBody, 'mode' | 'serviceRoot'>> & ExecuteBody): string {
  const serviceRoot = path.resolve(input.serviceRoot);
  const targetFileUrl = input.targetFile ? serviceFileUrl(serviceRoot, input.targetFile) : null;

  return `
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rawStdoutWrite = process.stdout.write.bind(process.stdout);
const rawStderrWrite = process.stderr.write.bind(process.stderr);
const send = (event) => rawStdoutWrite(JSON.stringify(event) + '\\n');
const finish = (exitCode) => {
  rawStdoutWrite('', () => process.exit(exitCode));
};
const writeDirectOutput = (level, chunk, encoding, callback) => {
  const text = Buffer.isBuffer(chunk)
    ? chunk.toString(typeof encoding === 'string' ? encoding : undefined)
    : String(chunk);
  const message = text.replace(/\\n$/, '');
  if (message) {
    send({ type: 'console', level, values: [message] });
  }
  if (typeof encoding === 'function') {
    encoding();
  } else if (typeof callback === 'function') {
    callback();
  }
  return true;
};
process.stdout.write = (chunk, encoding, callback) => writeDirectOutput('log', chunk, encoding, callback);
process.stderr.write = (chunk, encoding, callback) => writeDirectOutput('error', chunk, encoding, callback);
const seen = new WeakSet();
const format = (value) => {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value, (_key, nested) => {
        if (typeof nested === 'bigint') return nested.toString();
        if (nested && typeof nested === 'object') {
          if (seen.has(nested)) return '[Circular]';
          seen.add(nested);
        }
        return nested;
      }));
    } catch {
      return String(value);
    }
  }
  return value;
};
const serializeArgs = (args) => args.map(format);
for (const level of ['log', 'warn', 'error', 'info', 'debug']) {
  console[level] = (...args) => {
    send({ type: 'console', level, values: serializeArgs(args) });
  };
}

globalThis.importService = async (specifier) => {
  const resolved = path.isAbsolute(specifier)
    ? specifier
    : path.resolve(${JSON.stringify(serviceRoot)}, specifier);
  return import(pathToFileURL(resolved).href);
};

try {
  let value;
  if (${JSON.stringify(input.mode)} === 'method') {
    const module = await import(${JSON.stringify(targetFileUrl)});
    const exported = module[${JSON.stringify(input.exportName ?? '')}];
    if (exported === undefined) {
      throw new Error('Export not found: ${String(input.exportName ?? '')}');
    }
    const member = ${JSON.stringify(input.methodName ?? '')};
    const callable = member ? exported?.[member] : exported;
    if (typeof callable !== 'function') {
      throw new Error(member ? 'Method is not callable: ' + member : 'Export is not callable');
    }
    const args = JSON.parse(${JSON.stringify(input.argsJson ?? '[]')});
    if (!Array.isArray(args)) {
      throw new Error('Args JSON must be an array.');
    }
    value = await callable.apply(exported, args);
  } else {
    const userModule = await import(${JSON.stringify(input.code ?? '')});
    value = Object.prototype.hasOwnProperty.call(userModule, 'default') ? userModule.default : undefined;
  }
  send({ type: 'return', value: format(value) });
  finish(0);
} catch (error) {
  send({ type: 'error', message: error?.message ?? String(error), stack: error?.stack });
  finish(1);
}
`;
}

function normalizeSnippetSource(code: string): string {
  const lines = code.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index]?.trim() ?? '';
    if (!trimmed || trimmed.startsWith('//')) continue;
    if (!trimmed.startsWith('return ')) break;
    const expression = trimmed.replace(/^return\s+/, '').replace(/;$/, '');
    lines[index] = `${lines[index]?.match(/^\s*/)?.[0] ?? ''}export default ${expression};`;
    break;
  }
  return `declare const importService: (specifier: string) => Promise<any>;\n${lines.join('\n')}`;
}

async function writeTempFile(fileName: string, content: string): Promise<string> {
  const projectDir = path.join(process.cwd(), '.codex', 'temp', 'runapi', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(projectDir, { recursive: true });
  const filePath = path.join(projectDir, fileName);
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

executeRoute.post('/execute', async (c) => {
  const encoder = new TextEncoder();

  try {
    const body = await c.req.json<ExecuteBody>();
    const serviceRoot = path.resolve(body.serviceRoot ?? '');
    const mode: ExecuteMode = body.mode === 'snippet' ? 'snippet' : 'method';
    let compiledSnippetUrl = '';

    if (!body.serviceRoot?.trim()) {
      throw new Error('Enter a service root before running.');
    }

    if (mode === 'snippet') {
      const sourcePath = await writeTempFile('snippet.ts', normalizeSnippetSource(body.code ?? ''));
      const output = await build({
        entryPoints: [sourcePath],
        bundle: false,
        write: false,
        format: 'esm',
        platform: 'node',
        target: 'node22',
        sourcemap: 'inline',
        logLevel: 'silent',
        outfile: path.join(path.dirname(sourcePath), 'snippet.mjs')
      });
      const compiledPath = await writeTempFile('snippet.mjs', output.outputFiles[0]?.text ?? '');
      compiledSnippetUrl = pathToFileURL(compiledPath).href;
    }

    const runnerPath = await writeTempFile('runner.mjs', runnerSource({
      ...body,
      code: compiledSnippetUrl,
      mode,
      serviceRoot
    }));

    const stream = new ReadableStream({
      start(controller) {
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

        child.stdout.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk);
        });

        child.stderr.on('data', (chunk: Buffer) => {
          controller.enqueue(encoder.encode(encodeEvent({ type: 'stderr', message: chunk.toString() })));
        });

        child.on('error', (error) => {
          controller.enqueue(encoder.encode(encodeEvent({ type: 'error', message: error.message, stack: error.stack })));
          controller.close();
        });

        child.on('close', (exitCode) => {
          controller.enqueue(encoder.encode(encodeEvent({ type: 'done', exitCode })));
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            encodeEvent({
              type: 'error',
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            })
          )
        );
        controller.enqueue(encoder.encode(encodeEvent({ type: 'done', exitCode: 1 })));
        controller.close();
      }
    });

    return new Response(stream, {
      status: 400,
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' }
    });
  }
});
