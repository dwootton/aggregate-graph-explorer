import React, { useState, useRef, useEffect } from 'react';

type ExpressionBuilderProps = {
  value: string;
  onChange: (value: string) => void;
  availableAttributes: string[];
  availableFunctions: string[];
  placeholder?: string;
};

const ExpressionBuilder: React.FC<ExpressionBuilderProps> = ({
  value,
  onChange,
  availableAttributes,
  availableFunctions,
  placeholder = 'e.g., AVG(Person.age) or COUNT(Song)'
}) => {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteItems, setAutocompleteItems] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems = [...availableFunctions, ...availableAttributes];

  const updateAutocomplete = (text: string, cursorPos: number) => {
    const textBeforeCursor = text.substring(0, cursorPos);
    const lastWord = textBeforeCursor.split(/[^a-zA-Z0-9._]/).pop() || '';

    if (lastWord.length > 0) {
      const matches = allItems.filter(item =>
        item.toLowerCase().startsWith(lastWord.toLowerCase())
      );
      if (matches.length > 0) {
        setAutocompleteItems(matches);
        setSelectedIndex(0);
        setShowAutocomplete(true);
        return;
      }
    }
    setShowAutocomplete(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    updateAutocomplete(newValue, e.target.selectionStart || 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showAutocomplete) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, autocompleteItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertAutocomplete(autocompleteItems[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false);
    }
  };

  const insertAutocomplete = (item: string) => {
    const cursorPos = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPos);
    const textAfterCursor = value.substring(cursorPos);
    const lastWordStart = textBeforeCursor.split(/[^a-zA-Z0-9._]/).pop()?.length || 0;
    
    const newValue = 
      textBeforeCursor.substring(0, textBeforeCursor.length - lastWordStart) +
      item +
      (availableFunctions.includes(item) ? '()' : '') +
      textAfterCursor;
    
    onChange(newValue);
    setShowAutocomplete(false);
    
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = cursorPos - lastWordStart + item.length + (availableFunctions.includes(item) ? 1 : 0);
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        inputRef.current.focus();
      }
    }, 0);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
        onFocus={(e) => updateAutocomplete(e.target.value, e.target.selectionStart || 0)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-xs font-mono border border-vercel-border rounded focus:outline-none focus:border-vercel-black bg-white"
      />

      {showAutocomplete && autocompleteItems.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-vercel-border rounded shadow-sm z-50 max-h-48 overflow-y-auto">
          {autocompleteItems.map((item, index) => {
            const isFunction = availableFunctions.includes(item);
            return (
              <div
                key={item}
                className={`px-3 py-1.5 text-xs font-mono cursor-pointer ${
                  index === selectedIndex
                    ? 'bg-vercel-black text-white'
                    : 'hover:bg-vercel-bg text-vercel-black'
                }`}
                onClick={() => insertAutocomplete(item)}
              >
                <span className={isFunction && index !== selectedIndex ? 'font-semibold' : ''}>
                  {item}
                </span>
                {isFunction && <span className={`ml-1 ${index === selectedIndex ? 'opacity-70' : 'text-vercel-gray'}`}>()</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExpressionBuilder;
