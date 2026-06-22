import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSearch, Play, Sparkles, Zap } from 'lucide-react';
import { ArgsEditor } from './components/ArgsEditor';
import { AutocompleteInput } from './components/AutocompleteInput';
import { EditorPane } from './components/EditorPane';
import { ResultPane } from './components/ResultPane';
import { SignatureHint } from './components/SignatureHint';
import { TopPane } from './components/TopPane';
import { postJson } from './lib/api';
import { executeInNode } from './lib/executeInNode';
import type { EnvMode, InspectExport, LogEntry, RunEvent, RunnerMode, RunState, SignatureInfo, SignatureResult, SuggestResult } from './lib/types';

const billingRoot = '/Users/keogh/Sites/screencloud/billing/beta/pulse-backend-keogh/services/billing';

const defaultCode = `const { prismicDocuments } = await importService("src/integrations/prismic/documents.ts");

const document = await prismicDocuments.findById("replace-with-prismic-id");

return document;`;

const storageKeys = {
  argsJson: 'runapi:argsJson',
  code: 'runapi:code',
  envMode: 'runapi:envMode',
  exportName: 'runapi:exportName',
  methodName: 'runapi:methodName',
  mode: 'runapi:mode',
  serviceRoot: 'runapi:serviceRoot',
  targetFile: 'runapi:targetFile'
} as const;

function readStoredValue(key: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function readStoredMode(): RunnerMode {
  const value = readStoredValue(storageKeys.mode, 'method');
  return value === 'snippet' ? 'snippet' : 'method';
}

function readStoredEnvMode(): EnvMode {
  const value = readStoredValue(storageKeys.envMode, 'local');
  return value === 'test' || value === 'none' ? value : 'local';
}

const initialRunState: RunState = {
  logs: [],
  returnValue: undefined,
  hasReturn: false,
  running: false
};

function entryId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function eventToLog(event: RunEvent): LogEntry | null {
  if (event.type === 'console') {
    return { id: entryId(), level: event.level, values: event.values };
  }
  if (event.type === 'stderr') {
    return { id: entryId(), level: 'stderr', values: [event.message] };
  }
  if (event.type === 'error') {
    return { id: entryId(), level: 'error', values: [event.stack ?? event.message] };
  }
  return null;
}

function formatLastUpdated(timestamp: number, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (elapsedSeconds < 5) return 'Just now';
  if (elapsedSeconds < 60) return `${elapsedSeconds} seconds ago`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return elapsedMinutes === 1 ? '1 minute ago' : `${elapsedMinutes} minutes ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return elapsedHours === 1 ? '1 hour ago' : `${elapsedHours} hours ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays <= 5) {
    return elapsedDays === 1 ? '1 day ago' : `${elapsedDays} days ago`;
  }

  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export function App() {
  const [serviceRoot, setServiceRoot] = useState(() => readStoredValue(storageKeys.serviceRoot, billingRoot));
  const [targetFile, setTargetFile] = useState(() => readStoredValue(storageKeys.targetFile, 'src/integrations/prismic/documents.ts'));
  const [exportName, setExportName] = useState(() => readStoredValue(storageKeys.exportName, 'prismicDocuments'));
  const [methodName, setMethodName] = useState(() => readStoredValue(storageKeys.methodName, 'findById'));
  const [argsJson, setArgsJson] = useState(() => readStoredValue(storageKeys.argsJson, '["replace-with-prismic-id"]'));
  const [mode, setMode] = useState<RunnerMode>(() => readStoredMode());
  const [envMode, setEnvMode] = useState<EnvMode>(() => readStoredEnvMode());
  const [code, setCode] = useState(() => readStoredValue(storageKeys.code, defaultCode));
  const [runState, setRunState] = useState<RunState>(initialRunState);
  const [inspectExports, setInspectExports] = useState<InspectExport[]>([]);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [serviceSuggestions, setServiceSuggestions] = useState<string[]>([]);
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [signatures, setSignatures] = useState<SignatureInfo[]>([]);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [fakeArgsLoading, setFakeArgsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const fileMtimeRef = useRef<number | null>(null);
  const [editorWidth, setEditorWidth] = useState(58);
  const [resultTopHeight, setResultTopHeight] = useState(50);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const canRun = useMemo(() => {
    if (runState.running) return false;
    if (!serviceRoot.trim()) return false;
    if (mode === 'snippet') return code.trim().length > 0;
    return targetFile.trim().length > 0 && exportName.trim().length > 0;
  }, [code, exportName, mode, runState.running, serviceRoot, targetFile]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.serviceRoot, serviceRoot);
  }, [refreshKey, serviceRoot]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.targetFile, targetFile);
  }, [targetFile]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.exportName, exportName);
  }, [exportName]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.methodName, methodName);
  }, [methodName]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.argsJson, argsJson);
  }, [argsJson]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.code, code);
  }, [code]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.mode, mode);
  }, [mode]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.envMode, envMode);
  }, [envMode]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/suggest/services?q=${encodeURIComponent(serviceRoot)}`, {
          signal: controller.signal
        });
        const result = (await response.json()) as SuggestResult;
        if (!controller.signal.aborted) {
          setServiceSuggestions(result.suggestions.filter((item) => item !== serviceRoot));
        }
      } catch {
        if (!controller.signal.aborted) setServiceSuggestions([]);
      }
    }, 140);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [serviceRoot]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      if (!serviceRoot.trim()) {
        setFileSuggestions([]);
        return;
      }
      try {
        const params = new URLSearchParams({
          serviceRoot,
          q: targetFile
        });
        const response = await fetch(`/api/suggest/files?${params.toString()}`, {
          signal: controller.signal
        });
        const result = (await response.json()) as SuggestResult;
        if (!controller.signal.aborted) {
          setFileSuggestions(result.suggestions.filter((item) => item !== targetFile));
        }
      } catch {
        if (!controller.signal.aborted) setFileSuggestions([]);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [refreshKey, serviceRoot, targetFile]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      if (!serviceRoot.trim() || !targetFile.trim()) {
        setInspectExports([]);
        return;
      }
      try {
        const result = await postJson<{ exports: InspectExport[] }>('/api/inspect', {
          envMode,
          serviceRoot,
          targetFile
        });
        if (!controller.signal.aborted) {
          setInspectError(null);
          setInspectExports(result.exports);
        }
      } catch {
        if (!controller.signal.aborted) {
          setInspectExports([]);
        }
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [envMode, refreshKey, serviceRoot, targetFile]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      if (!serviceRoot.trim() || !targetFile.trim() || !exportName.trim()) {
        setSignatures([]);
        setSignatureError(null);
        return;
      }
      setSignatureLoading(true);
      try {
        const response = await fetch('/api/signature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceRoot,
            targetFile,
            exportName,
            methodName
          }),
          signal: controller.signal
        });
        const result = (await response.json()) as SignatureResult & { error?: string };
        if (!response.ok) {
          throw new Error(result.error ?? `Signature lookup failed: ${response.status}`);
        }
        if (!controller.signal.aborted) {
          setSignatures(result.signatures);
          setSignatureError(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setSignatures([]);
          setSignatureError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setSignatureLoading(false);
        }
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [exportName, methodName, refreshKey, serviceRoot, targetFile]);

  useEffect(() => {
    if (mode !== 'method' || !serviceRoot.trim() || !targetFile.trim()) {
      fileMtimeRef.current = null;
      return;
    }

    const params = new URLSearchParams({ serviceRoot, targetFile });
    const source = new EventSource(`/api/state/file/watch?${params.toString()}`);
    const handleState = (event: MessageEvent<string>, updateTimestamp: boolean) => {
      const result = JSON.parse(event.data) as { exists: boolean; mtimeMs: number | null };
      if (!result.exists) return;
      const previous = fileMtimeRef.current;
      fileMtimeRef.current = result.mtimeMs;
      if (updateTimestamp && previous !== null && result.mtimeMs !== previous) {
        setLastUpdatedAt(Date.now());
        setRefreshKey((current) => current + 1);
      }
    };

    source.addEventListener('ready', (event) => handleState(event as MessageEvent<string>, false));
    source.addEventListener('change', (event) => handleState(event as MessageEvent<string>, true));
    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [mode, serviceRoot, targetFile]);

  function startVerticalResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const move = (moveEvent: globalThis.PointerEvent) => {
      const percent = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
      setEditorWidth(Math.min(75, Math.max(35, percent)));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  function startHorizontalResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = resultRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const move = (moveEvent: globalThis.PointerEvent) => {
      const percent = ((moveEvent.clientY - bounds.top) / bounds.height) * 100;
      setResultTopHeight(Math.min(78, Math.max(22, percent)));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  async function inspectTarget() {
    if (!serviceRoot.trim() || !targetFile.trim()) return;

    setInspecting(true);
    setInspectError(null);
    try {
      const result = await postJson<{ exports: InspectExport[] }>('/api/inspect', {
        envMode,
        serviceRoot,
        targetFile
      });
      setInspectExports(result.exports);
      if (!exportName && result.exports[0]) {
        setExportName(result.exports[0].name);
      }
    } catch (error) {
      setInspectExports([]);
      setInspectError(error instanceof Error ? error.message : String(error));
    } finally {
      setInspecting(false);
    }
  }

  async function run() {
    if (!canRun) return;

    setRunState({ ...initialRunState, running: true });

    const emit = (event: RunEvent) => {
      setRunState((current) => {
        const log = eventToLog(event);
        if (event.type === 'return') {
          return { ...current, returnValue: event.value, hasReturn: true };
        }
        if (event.type === 'done') {
          return { ...current, running: false };
        }
        if (log) {
          return { ...current, logs: [...current.logs, log] };
        }
        return current;
      });
    };

    try {
      JSON.parse(argsJson);
      await executeInNode({
        argsJson,
        code,
        envMode,
        exportName,
        methodName,
        mode,
        serviceRoot,
        targetFile
      }, emit);
    } catch (error) {
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      emit({ type: 'done', exitCode: 1 });
    }
  }

  function clearSavedInput() {
    for (const value of Object.values(storageKeys)) {
      window.localStorage.removeItem(value);
    }
    setServiceRoot(billingRoot);
    setTargetFile('src/integrations/prismic/documents.ts');
    setExportName('prismicDocuments');
    setMethodName('findById');
    setArgsJson('["replace-with-prismic-id"]');
    setMode('method');
    setEnvMode('local');
    setCode(defaultCode);
    setInspectExports([]);
    setInspectError(null);
  }

  async function fakeArgsFromSignature() {
    const signature = signatures[0];
    if (!signature) return;
    setFakeArgsLoading(true);
    try {
      const { generateArgsJson } = await import('./lib/fakeArgs');
      setArgsJson(generateArgsJson(signature));
    } finally {
      setFakeArgsLoading(false);
    }
  }

  function handleTargetFileSelect(value: string) {
    if (value.endsWith('/')) {
      setFileSuggestions([]);
    }
  }

  function refreshFields() {
    fileMtimeRef.current = null;
    setRefreshKey((current) => current + 1);
  }

  const selectedExport = inspectExports.find((item) => item.name === exportName);

  return (
    <div className={`app-shell mode-${mode}`}>
      <TopPane
        envMode={envMode}
        mode={mode}
        onClearSaved={clearSavedInput}
        onEnvModeChange={setEnvMode}
        onModeChange={setMode}
        onRefresh={refreshFields}
        onServiceRootChange={setServiceRoot}
        serviceRoot={serviceRoot}
        serviceSuggestions={serviceSuggestions}
      />
      <main
        className="workspace"
        ref={workspaceRef}
        style={{ '--editor-width': `${editorWidth}%` } as CSSProperties}
      >
        <div className="editor-column">
          {mode === 'method' ? (
            <section className="method-pane" aria-label="Method runner">
              <div className="panel-header">
                <FileSearch size={18} aria-hidden="true" />
                <span>Target</span>
              </div>
              <div className="method-form">
                <label>
                  <span>File</span>
                  <AutocompleteInput
                    keepOpenOnSelect={(value) => value.endsWith('/')}
                    onChange={setTargetFile}
                    onSelect={handleTargetFileSelect}
                    suggestions={fileSuggestions}
                    value={targetFile}
                  />
                </label>
                <div className="inline-fields">
                  <label>
                    <span>Export</span>
                    <AutocompleteInput
                      value={exportName}
                      onChange={setExportName}
                      suggestions={inspectExports.map((item) => item.name).filter((item) => item.toLowerCase().includes(exportName.toLowerCase()) && item !== exportName)}
                    />
                  </label>
                  <label>
                    <span>Method</span>
                    <AutocompleteInput
                      value={methodName}
                      onChange={setMethodName}
                      suggestions={(selectedExport?.methods ?? []).filter((item) => item.toLowerCase().includes(methodName.toLowerCase()) && item !== methodName)}
                    />
                  </label>
                </div>
                <div className="field args-field">
                  <span>Args JSON array</span>
                  <ArgsEditor value={argsJson} onChange={setArgsJson} />
                </div>
                <div className="args-tools">
                  <button
                    className="fake-args-button"
                    disabled={fakeArgsLoading || signatureLoading || signatures.length === 0}
                    onClick={fakeArgsFromSignature}
                    title={signatures.length > 0 ? 'Generate fake args from the loaded signature' : 'Load a signature before generating fake args'}
                    type="button"
                  >
                    <Sparkles size={15} aria-hidden="true" />
                    <span>{fakeArgsLoading ? 'Faking...' : 'Fake args'}</span>
                  </button>
                </div>
                <div className="field signature-field">
                  <span>Signature</span>
                  <SignatureHint error={signatureError} loading={signatureLoading} signatures={signatures} />
                </div>
                <div className="method-actions">
                  <button className="inspect-button" disabled={inspecting || !serviceRoot.trim() || !targetFile.trim()} onClick={inspectTarget} type="button">
                    {inspecting ? 'Inspecting...' : 'Inspect'}
                  </button>
                  <div className="inspect-status">
                    {inspectError ?? (inspectExports.length > 0 ? `${inspectExports.length} export${inspectExports.length === 1 ? '' : 's'} found` : 'No inspection run yet')}
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <EditorPane code={code} editorLibs={[]} onChange={setCode} />
          )}
          <button className="run-button" disabled={!canRun} onClick={run} type="button">
            <Play size={18} aria-hidden="true" />
            {runState.running ? 'Running...' : 'Run'}
          </button>
        </div>
        <div
          className="vertical-resizer"
          onPointerDown={startVerticalResize}
          role="separator"
          aria-orientation="vertical"
        />
        <div
          className="result-wrap"
          ref={resultRef}
          style={{ '--result-top-height': `${resultTopHeight}%` } as CSSProperties}
        >
          <ResultPane
            logs={runState.logs}
            returnValue={runState.returnValue}
            hasReturn={runState.hasReturn}
            onResizeStart={startHorizontalResize}
          />
        </div>
      </main>
      <footer className="status-bar">
        <div className="runtime-status">
          <span className="status-dot" aria-hidden="true" />
          Node child process · {envMode === 'local' ? '.local.env + .override.env' : envMode === 'test' ? '.test.env' : 'no env files'}
        </div>
        <div className="ready-status">
          <Zap size={16} aria-hidden="true" />
          {runState.running ? 'Running' : 'Ready'}
          <span className="updated-status">Updated {formatLastUpdated(lastUpdatedAt, now)}</span>
        </div>
      </footer>
    </div>
  );
}
