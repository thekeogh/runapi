import Editor, { type Monaco } from '@monaco-editor/react';

type ArgsEditorProps = {
  onChange: (value: string) => void;
  value: string;
};

function configureJson(monaco: Monaco) {
  monaco.editor.defineTheme('runapi-json', {
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
      'editorCursor.foreground': '#b76cff',
      'editor.selectionBackground': '#312a52',
      'editor.inactiveSelectionBackground': '#241f3a'
    }
  } as Parameters<typeof monaco.editor.defineTheme>[1]);

  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    schemas: [
      {
        uri: 'runapi://args.schema.json',
        fileMatch: ['runapi-args.json'],
        schema: {
          type: 'array',
          title: 'Method arguments',
          description: 'RunAPI passes each array item as one method argument.',
          items: {}
        }
      }
    ]
  });
}

export function ArgsEditor({ onChange, value }: ArgsEditorProps) {
  return (
    <div className="args-editor">
      <Editor
        language="json"
        theme="runapi-json"
        value={value}
        path="runapi-args.json"
        beforeMount={configureJson}
        onChange={(next) => onChange(next ?? '')}
        options={{
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          fixedOverflowWidgets: true,
          folding: true,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 14,
          formatOnPaste: true,
          formatOnType: true,
          glyphMargin: false,
          lineDecorationsWidth: 8,
          lineNumbers: 'on',
          minimap: { enabled: false },
          padding: { top: 12, bottom: 12 },
          quickSuggestions: {
            comments: false,
            other: true,
            strings: false
          },
          scrollBeyondLastLine: false,
          stickyScroll: { enabled: false },
          tabSize: 2,
          wordWrap: 'on'
        }}
      />
    </div>
  );
}
