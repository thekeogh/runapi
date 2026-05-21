import { Braces, FileCode2, Folder, PackageSearch, Trash2 } from 'lucide-react';
import type { EnvMode, RunnerMode } from '../lib/types';
import { AutocompleteInput } from './AutocompleteInput';

type TopPaneProps = {
  envMode: EnvMode;
  mode: RunnerMode;
  onClearSaved: () => void;
  onEnvModeChange: (mode: EnvMode) => void;
  onModeChange: (mode: RunnerMode) => void;
  onServiceRootChange: (value: string) => void;
  serviceRoot: string;
  serviceSuggestions: string[];
};

export function TopPane({
  envMode,
  mode,
  onClearSaved,
  onEnvModeChange,
  onModeChange,
  onServiceRootChange,
  serviceRoot,
  serviceSuggestions
}: TopPaneProps) {
  return (
    <header className="top-pane">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          <PackageSearch size={24} strokeWidth={2.4} />
        </div>
        <div className="brand">RunAPI</div>
      </div>
      <div className="header-divider" />
      <label className="path-field">
        <Folder size={18} aria-hidden="true" />
        <span>Service</span>
        <AutocompleteInput
          value={serviceRoot}
          onChange={onServiceRootChange}
          placeholder="/Users/username/path/to/service"
          suggestions={serviceSuggestions}
        />
      </label>
      <div className="header-actions">
        <div className="mode-switch runner-switch" role="tablist" aria-label="Runner mode">
          <button
            className={mode === 'method' ? 'active' : ''}
            onClick={() => onModeChange('method')}
            role="tab"
            aria-selected={mode === 'method'}
            type="button"
          >
            <Braces size={18} aria-hidden="true" />
            Method
          </button>
          <button
            className={mode === 'snippet' ? 'active' : ''}
            onClick={() => onModeChange('snippet')}
            role="tab"
            aria-selected={mode === 'snippet'}
            type="button"
          >
            <FileCode2 size={18} aria-hidden="true" />
            Snippet
          </button>
        </div>
        <select
          className="env-select"
          value={envMode}
          onChange={(event) => onEnvModeChange(event.target.value as EnvMode)}
          aria-label="Environment files"
        >
          <option value="local">.local + .override</option>
          <option value="test">.test</option>
          <option value="none">No env files</option>
        </select>
        <button className="clear-memory-button" onClick={onClearSaved} title="Clear saved input" type="button">
          <Trash2 size={18} aria-hidden="true" />
          <span className="sr-only">Clear saved input</span>
        </button>
      </div>
    </header>
  );
}
