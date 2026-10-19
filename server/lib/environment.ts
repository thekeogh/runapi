type EnvMode = 'local' | 'test' | 'none';

export function envArgs(mode?: EnvMode): string[] {
  if (mode === 'none') return [];

  const files = mode === 'test'
    ? ['.env', '.env.test', '.env.test.local', '.test.env']
    : ['.env', '.env.local', '.env.development', '.env.development.local', '.local.env', '.override.env'];

  return files.map((file) => `--env-file-if-exists=${file}`);
}

export function childEnvironment(mode?: EnvMode): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(mode === 'none' ? {} : { NODE_ENV: process.env.NODE_ENV ?? (mode === 'test' ? 'test' : 'development') }),
    NODE_NO_WARNINGS: '1'
  };
}
