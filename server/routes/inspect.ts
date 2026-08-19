import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export const inspectRoute = new Hono();

type InspectBody = {
  envMode?: 'local' | 'test' | 'none';
  serviceRoot?: string;
  targetFile?: string;
};

type MethodAccess = 'public' | 'private' | 'protected';

type StaticAccessMap = Record<string, Record<string, MethodAccess>>;

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

function methodName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function memberAccess(member: ts.ClassElement): MethodAccess {
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) ?? [] : [];
  if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword)) return 'private';
  if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ProtectedKeyword)) return 'protected';
  return 'public';
}

function classMethodAccess(classDeclaration: ts.ClassDeclaration): Record<string, MethodAccess> {
  const methods: Record<string, MethodAccess> = {};
  for (const member of classDeclaration.members) {
    if (!ts.isMethodDeclaration(member) && !ts.isGetAccessorDeclaration(member) && !ts.isSetAccessorDeclaration(member)) {
      continue;
    }
    const name = methodName(member.name);
    if (name) methods[name] = memberAccess(member);
  }
  return methods;
}

function exportedName(name: ts.BindingName): string | null {
  return ts.isIdentifier(name) ? name.text : null;
}

function isExported(node: ts.Node): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function classNameFromInitializer(initializer: ts.Expression): string | null {
  if (ts.isNewExpression(initializer) && ts.isIdentifier(initializer.expression)) {
    return initializer.expression.text;
  }
  return null;
}

async function staticAccessMap(filePath: string): Promise<StaticAccessMap> {
  const sourceText = await readFile(filePath, 'utf8').catch(() => '');
  if (!sourceText) return {};

  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classes = new Map<string, Record<string, MethodAccess>>();
  const exports: StaticAccessMap = {};

  for (const statement of sourceFile.statements) {
    if (ts.isClassDeclaration(statement) && statement.name) {
      const access = classMethodAccess(statement);
      classes.set(statement.name.text, access);
      if (isExported(statement)) {
        exports[statement.name.text] = access;
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      const exportName = exportedName(declaration.name);
      if (!exportName || !declaration.initializer) continue;
      const className = classNameFromInitializer(declaration.initializer);
      if (className && classes.has(className)) {
        exports[exportName] = classes.get(className)!;
      }
    }
  }

  return exports;
}

function runnerSource(fileUrl: string, accessMap: StaticAccessMap): string {
  return `
const accessMap = ${JSON.stringify(accessMap)};
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
    return {
      name,
      type: typeof value,
      methods: [...new Set(methods)].sort().map((methodName) => ({
        name: methodName,
        access: accessMap[name]?.[methodName] ?? 'public'
      }))
    };
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

  const absoluteTarget = path.isAbsolute(targetFile) ? targetFile : path.resolve(serviceRoot, targetFile);
  const runnerPath = await writeTempRunner(runnerSource(targetUrl(serviceRoot, targetFile), await staticAccessMap(absoluteTarget)));
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
