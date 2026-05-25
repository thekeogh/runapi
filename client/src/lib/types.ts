export type RunnerMode = 'method' | 'snippet';
export type EnvMode = 'local' | 'test' | 'none';

export type ConsoleLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export type LogEntry = {
  id: string;
  level: ConsoleLevel | 'stderr';
  values: unknown[];
};

export type RunState = {
  logs: LogEntry[];
  returnValue: unknown;
  hasReturn: boolean;
  running: boolean;
};

export type RunEvent =
  | { type: 'console'; level: ConsoleLevel; values: unknown[] }
  | { type: 'stderr'; message: string }
  | { type: 'return'; value: unknown }
  | { type: 'error'; message: string; stack?: string }
  | { type: 'done'; exitCode: number | null };

export type EditorLib = {
  filePath: string;
  content: string;
};

export type ExecuteRequest = {
  argsJson: string;
  code: string;
  envMode: EnvMode;
  exportName: string;
  methodName: string;
  mode: RunnerMode;
  serviceRoot: string;
  targetFile: string;
};

export type InspectExport = {
  name: string;
  type: string;
  methods: string[];
};

export type SuggestResult = {
  suggestions: string[];
};

export type TypeProperty = {
  name: string;
  optional: boolean;
  type: string;
  properties?: TypeProperty[];
};

export type SignatureParam = TypeProperty;

export type SignatureInfo = {
  label: string;
  params: SignatureParam[];
  returnIsArray: boolean;
  returnType: string;
  returnProperties?: TypeProperty[];
};

export type SignatureResult = {
  signatures: SignatureInfo[];
};
