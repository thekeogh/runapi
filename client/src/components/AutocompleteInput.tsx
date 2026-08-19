import { type ReactNode, useState } from 'react';

type AutocompleteInputProps = {
  className?: string;
  keepOpenOnSelect?: (value: string) => boolean;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  renderSuggestion?: (value: string) => ReactNode;
  suggestions: string[];
  value: string;
};

export function AutocompleteInput({
  className,
  keepOpenOnSelect,
  onChange,
  onSelect,
  onFocus,
  placeholder,
  renderSuggestion,
  suggestions,
  value
}: AutocompleteInputProps) {
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const visible = focused && suggestions.length > 0;

  function choose(suggestion: string) {
    const keepOpen = keepOpenOnSelect?.(suggestion) ?? false;
    onChange(suggestion);
    onSelect?.(suggestion);
    setFocused(keepOpen);
    setActiveIndex(0);
  }

  return (
    <div className={`autocomplete ${className ?? ''}`}>
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(0);
        }}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={(event) => {
          if (!visible) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((current) => Math.min(suggestions.length - 1, current + 1));
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((current) => Math.max(0, current - 1));
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            choose(suggestions[activeIndex] ?? suggestions[0]);
          }
          if (event.key === 'Escape') {
            setFocused(false);
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
      />
      {visible ? (
        <div className="autocomplete-menu">
          {suggestions.map((suggestion, index) => (
            <button
              className={index === activeIndex ? 'active' : ''}
              key={suggestion}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(suggestion)}
              type="button"
            >
              {renderSuggestion ? renderSuggestion(suggestion) : suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
