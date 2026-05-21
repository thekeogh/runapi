import { useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import { Code2 } from 'lucide-react';
import type { IDisposable } from 'monaco-editor';
import type { EditorLib } from '../lib/types';

type EditorPaneProps = {
  code: string;
  editorLibs: EditorLib[];
  onChange: (code: string) => void;
};

function configureTypeScript(monaco: Monaco) {
  const options = {
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: 100,
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    strict: true,
    noEmit: true,
    typeRoots: ['file:///node_modules/@types']
  };

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(options);
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(options);
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [1108, 1128]
  });

  monaco.editor.defineTheme('runapi-dark', {
    base: 'vs-dark',
    inherit: true,
    semanticHighlighting: true,
    rules: [
      { token: 'keyword', foreground: 'b76cff' },
      { token: 'string', foreground: 'd9f7a5' },
      { token: 'number', foreground: 'f5b642' },
      { token: 'variable.predefined', foreground: '6bdcff' },
      { token: 'support.function', foreground: '9fa8ff' },
      { token: 'type.identifier', foreground: '6bdcff' },
      { token: 'identifier', foreground: 'f4f7fb' },
      { token: 'delimiter', foreground: '8f9baa' }
    ],
    semanticTokenColors: {
      'variable.defaultLibrary': '#6bdcff',
      property: '#f4f7fb',
      method: '#9fa8ff',
      function: '#9fa8ff',
      class: '#6bdcff',
      interface: '#6bdcff',
      type: '#6bdcff'
    },
    colors: {
      'editor.background': '#171526',
      'editor.foreground': '#f4f7fb',
      'editorLineNumber.foreground': '#5b6470',
      'editorLineNumber.activeForeground': '#aeb8c5',
      'editorCursor.foreground': '#b76cff',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#1f3447'
    }
  } as Parameters<typeof monaco.editor.defineTheme>[1]);
}

export function EditorPane({ code, editorLibs, onChange }: EditorPaneProps) {
  const monacoRef = useRef<Monaco | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;

    for (const disposable of disposablesRef.current) {
      disposable.dispose();
    }

    disposablesRef.current = editorLibs.map((lib) =>
      monaco.languages.typescript.typescriptDefaults.addExtraLib(lib.content, lib.filePath)
    );

    return () => {
      for (const disposable of disposablesRef.current) {
        disposable.dispose();
      }
      disposablesRef.current = [];
    };
  }, [editorLibs]);

  return (
    <section className="editor-pane" aria-label="Code editor">
      <div className="panel-header">
        <Code2 size={18} aria-hidden="true" />
        <span>Script</span>
      </div>
      <div className="editor-host">
        <Editor
          language="typescript"
          theme="runapi-dark"
          value={code}
          path="file:///runapi-entry.ts"
          beforeMount={(monaco) => {
            monacoRef.current = monaco;
            configureTypeScript(monaco);
          }}
          onChange={(value) => onChange(value ?? '')}
          options={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 14,
            lineNumbers: 'on',
            minimap: { enabled: false },
            wordWrap: 'off',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            'semanticHighlighting.enabled': true,
            quickSuggestions: {
              other: true,
              comments: false,
              strings: true
            },
            suggestOnTriggerCharacters: true,
            parameterHints: {
              enabled: true,
              cycle: true
            },
            tabSize: 2,
            padding: { top: 16, bottom: 16 }
          }}
        />
      </div>
    </section>
  );
}
