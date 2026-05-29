import type { PointerEvent } from 'react';
import { useState } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import { Check, Copy, CornerDownRight, Terminal } from 'lucide-react';
import { displayValue } from '../lib/format';
import type { LogEntry } from '../lib/types';

type ResultPaneProps = {
  logs: LogEntry[];
  returnValue: unknown;
  hasReturn: boolean;
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
};

function configureReturnEditor(monaco: Monaco) {
  monaco.editor.defineTheme('runapi-return', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: 'c4b5fd' },
      { token: 'string.value.json', foreground: 'd9f7a5' },
      { token: 'number.json', foreground: 'f5b642' },
      { token: 'keyword.json', foreground: '9fa8ff' },
      { token: 'delimiter.bracket.json', foreground: 'b76cff' }
    ],
    colors: {
      'editor.background': '#101722',
      'editor.foreground': '#dbe3ef',
      'editorLineNumber.foreground': '#5b6470',
      'editorLineNumber.activeForeground': '#aeb8c5',
      'editor.selectionBackground': '#312a52',
      'editor.inactiveSelectionBackground': '#241f3a'
    }
  } as Parameters<typeof monaco.editor.defineTheme>[1]);
}

function getReturnLanguage(output: string) {
  try {
    JSON.parse(output);
    return 'json';
  } catch {
    return 'plaintext';
  }
}

function ReturnViewer({ value }: { value: unknown }) {
  const output = displayValue(value);

  return (
    <div className="return-editor">
      <Editor
        beforeMount={configureReturnEditor}
        language={getReturnLanguage(output)}
        path="runapi-return.json"
        theme="runapi-return"
        value={output}
        options={{
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          domReadOnly: true,
          fixedOverflowWidgets: true,
          folding: true,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          glyphMargin: false,
          lineDecorationsWidth: 8,
          lineNumbers: 'on',
          minimap: { enabled: false },
          padding: { top: 14, bottom: 14 },
          readOnly: true,
          renderValidationDecorations: 'off',
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: 'on'
        }}
      />
    </div>
  );
}

export function ResultPane({ logs, returnValue, hasReturn, onResizeStart }: ResultPaneProps) {
  const [copied, setCopied] = useState(false);
  const returnText = hasReturn ? displayValue(returnValue) : '';

  async function copyReturnValue() {
    if (!hasReturn) return;

    await navigator.clipboard.writeText(returnText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section className="result-pane" aria-label="Execution results">
      <div className="result-section stdout-section">
        <div className="panel-header return-header">
          <Terminal size={18} aria-hidden="true" />
          <span>Stdout</span>
        </div>
        <div className="log-list">
          {logs.length === 0 ? (
            <div className="empty-state">Run your code to see output here</div>
          ) : (
            logs.map((entry) => (
              <div className="log-entry" key={entry.id}>
                <span className={`badge badge-${entry.level}`}>[{entry.level}]</span>
                <pre>{entry.values.map(displayValue).join(' ')}</pre>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="result-divider" onPointerDown={onResizeStart} role="separator" aria-orientation="horizontal" />
      <div className="result-section return-section">
        <div className="panel-header">
          <div className="panel-title">
            <CornerDownRight size={18} aria-hidden="true" />
            <span>Return</span>
          </div>
          <button
            className="copy-return-button"
            disabled={!hasReturn}
            onClick={copyReturnValue}
            title={hasReturn ? 'Copy return value' : 'No return value to copy'}
            type="button"
          >
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span className="sr-only">{copied ? 'Copied return value' : 'Copy return value'}</span>
          </button>
        </div>
        {hasReturn ? <ReturnViewer value={returnValue} /> : <div className="empty-state">No return value yet</div>}
      </div>
    </section>
  );
}
