import type { PointerEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Check, Copy, CornerDownRight, Terminal } from 'lucide-react';
import { displayValue } from '../lib/format';
import type { LogEntry } from '../lib/types';

type ResultPaneProps = {
  logs: LogEntry[];
  returnValue: unknown;
  hasReturn: boolean;
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
};

function HighlightedReturn({ value }: { value: unknown }) {
  const output = displayValue(value);
  const tokenPattern =
    /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|\b(true|false)\b|\b(null|undefined)\b|(-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/gi;
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of output.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(output.slice(lastIndex, index));
    }

    const className = match[1]
      ? 'syntax-key'
      : match[2]
        ? 'syntax-string'
        : match[3]
          ? 'syntax-boolean'
          : match[4]
            ? 'syntax-null'
            : 'syntax-number';

    parts.push(
      <span className={className} key={`${index}-${match[0]}`}>
        {match[0]}
      </span>
    );
    lastIndex = index + match[0].length;
  }

  if (lastIndex < output.length) {
    parts.push(output.slice(lastIndex));
  }

  return <pre className="syntax-output">{parts}</pre>;
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
        {hasReturn ? <HighlightedReturn value={returnValue} /> : <div className="empty-state">No return value yet</div>}
      </div>
    </section>
  );
}
