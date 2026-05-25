import type { SignatureInfo, TypeProperty } from '../lib/types';
import type { ReactElement } from 'react';

type SignatureHintProps = {
  error: string | null;
  loading: boolean;
  signatures: SignatureInfo[];
};

function typeLine(name: string, type: string, optional: boolean, depth: number) {
  return `${'  '.repeat(depth)}${name}${optional ? '?' : ''}: ${type}`;
}

function renderProperties(properties: TypeProperty[], depth = 1): string[] {
  return properties.flatMap((property) => [
    typeLine(property.name, property.type, property.optional, depth),
    ...(property.properties?.length ? renderProperties(property.properties, depth + 1) : [])
  ]);
}

function renderInput(signature: SignatureInfo): string {
  if (signature.params.length === 0) {
    return '{}';
  }
  return [
    '{',
    ...signature.params.flatMap((param) => [
      typeLine(param.name, param.type, param.optional, 1),
      ...(param.properties?.length ? renderProperties(param.properties, 2) : [])
    ]),
    '}'
  ].join('\n');
}

function renderOutput(signature: SignatureInfo): string {
  if (!signature.returnProperties?.length) {
    return signature.returnType;
  }
  return [
    '{',
    ...renderProperties(signature.returnProperties),
    `}${signature.returnIsArray ? '[]' : ''}`
  ].join('\n');
}

function HighlightedInterface({ code }: { code: string }) {
  const tokenPattern =
    /(\{|\})|(\??:)|(\[[^\]]+\]|[A-Za-z_$][\w$]*)(?=\??:)|\b(string|number|boolean|bigint|symbol|void|undefined|null|unknown|any|never|Promise|Array|Record)\b|("[^"]*"|'[^']*')/g;
  const parts: Array<string | ReactElement> = [];
  let lastIndex = 0;

  for (const match of code.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(code.slice(lastIndex, index));
    }
    const className = match[1]
      ? 'sig-brace'
      : match[2]
        ? 'sig-colon'
        : match[3]
          ? 'sig-key'
          : match[4]
            ? 'sig-type'
            : 'sig-string';
    parts.push(<span className={className} key={`${index}-${match[0]}`}>{match[0]}</span>);
    lastIndex = index + match[0].length;
  }

  if (lastIndex < code.length) {
    parts.push(code.slice(lastIndex));
  }

  return <pre className="signature-code">{parts}</pre>;
}

export function SignatureHint({ error, loading, signatures }: SignatureHintProps) {
  if (loading) {
    return <div className="signature-hint muted">Reading TypeScript signature...</div>;
  }

  if (error) {
    return <div className="signature-hint error">{error}</div>;
  }

  if (signatures.length === 0) {
    return <div className="signature-hint muted">No signature loaded yet</div>;
  }

  return (
    <div className="signature-hint">
      {signatures.map((signature, index) => (
        <div className="signature-card" key={`${signature.label}-${index}`}>
          <div className="signature-section">
            <div className="signature-heading">Input</div>
            <HighlightedInterface code={renderInput(signature)} />
          </div>
          <div className="signature-section">
            <div className="signature-heading">Output</div>
            <HighlightedInterface code={renderOutput(signature)} />
          </div>
        </div>
      ))}
    </div>
  );
}
