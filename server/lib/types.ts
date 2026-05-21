export type ResolveResult = {
  inputPath: string;
  packageRoot: string;
  packageJsonPath: string;
  entryPath: string;
  entrySpecifier: string;
  packageName: string;
};

export type EditorLib = {
  filePath: string;
  content: string;
};

export type IntellisenseResult = {
  packageName: string;
  libs: EditorLib[];
};

export type ConsoleLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export type RunEvent =
  | { type: 'console'; level: ConsoleLevel; values: unknown[] }
  | { type: 'stderr'; message: string }
  | { type: 'return'; value: unknown; serialized?: boolean }
  | { type: 'error'; message: string; stack?: string }
  | { type: 'done'; exitCode: number | null };
