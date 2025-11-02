import React, { useState, useRef, useEffect } from 'react';

type AttributeMetadata = {
  name: string;
  type: 'numeric' | 'boolean' | 'string' | 'date';
  isNumeric: boolean;
  isBoolean: boolean;
  cardinality: number;
  completeness: number;
  min?: number;
  max?: number;
  mean?: number;
  uniqueValues: any[];
  distribution: { [key: string]: number };
};

type ExpressionBuilderProps = {
  value: string;
  onChange: (value: string) => void;
  availableAttributes: AttributeMetadata[];
  availableFunctions: string[];
  placeholder?: string;
};

const ExpressionBuilder: React.FC<ExpressionBuilderProps> = ({
  value,
  onChange,
  availableAttributes,
  availableFunctions,
  placeholder = 'e.g., AVG(Person.age) or COUNT(Song.single==True)'
}) => {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteItems, setAutocompleteItems] = useState<(string | AttributeMetadata)[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems: (string | AttributeMetadata)[] = [...availableFunctions, ...availableAttributes];

  const updateAutocomplete = (text: string, cursorPos: number) => {
    const textBeforeCursor = text.substring(0, cursorPos);
    const lastWord = textBeforeCursor.split(/[^a-zA-Z0-9._]/).pop() || '';

    if (lastWord.length > 0) {
      const matches = allItems.filter(item => {
        const itemName = typeof item === 'string' ? item : item.name;
        return itemName.toLowerCase().startsWith(lastWord.toLowerCase());
      });
      if (matches.length > 0) {
        setAutocompleteItems(matches);
        setSelectedIndex(0);
        setHoveredIndex(null);
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

  const insertAutocomplete = (item: string | AttributeMetadata) => {
    const itemName = typeof item === 'string' ? item : item.name;
    const cursorPos = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPos);
    const textAfterCursor = value.substring(cursorPos);
    const lastWordStart = textBeforeCursor.split(/[^a-zA-Z0-9._]/).pop()?.length || 0;
    
    const isFunction = availableFunctions.includes(itemName);
    const newValue = 
      textBeforeCursor.substring(0, textBeforeCursor.length - lastWordStart) +
      itemName +
      (isFunction ? '()' : '') +
      textAfterCursor;
    
    onChange(newValue);
    setShowAutocomplete(false);
    
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = cursorPos - lastWordStart + itemName.length + (isFunction ? 1 : 0);
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
            const itemName = typeof item === 'string' ? item : item.name;
            const isFunction = availableFunctions.includes(itemName);
            const isAttribute = typeof item === 'object';
            const showTooltip = (hoveredIndex === index || selectedIndex === index) && isAttribute;
            
            return (
              <div
                key={itemName}
                className={`relative px-3 py-1.5 text-xs font-mono cursor-pointer ${
                  index === selectedIndex
                    ? 'bg-vercel-black text-white'
                    : 'hover:bg-vercel-bg text-vercel-black'
                }`}
                onClick={() => insertAutocomplete(item)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <span className={isFunction && index !== selectedIndex ? 'font-semibold' : ''}>
                  {itemName}
                </span>
                {isFunction && <span className={`ml-1 ${index === selectedIndex ? 'opacity-70' : 'text-vercel-gray'}`}>()</span>}
                
                {showTooltip && (
                  <div className="absolute left-full top-0 ml-2 w-64 bg-white border border-vercel-border rounded shadow-lg p-3 text-xs z-[100]">
                    <div className="space-y-1.5 text-vercel-black">
                      <div className="font-semibold border-b border-vercel-border pb-1 mb-2">{itemName}</div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-vercel-gray">Type:</span>
                        <span className="font-mono font-semibold">{item.type}</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-vercel-gray">Cardinality:</span>
                        <span className="font-mono">{item.cardinality}</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-vercel-gray">Completeness:</span>
                        <span className="font-mono">{item.completeness.toFixed(1)}%</span>
                      </div>
                      
                      {item.isNumeric && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-vercel-gray">Range:</span>
                            <span className="font-mono">{item.min?.toFixed(2)} - {item.max?.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-vercel-gray">Mean:</span>
                            <span className="font-mono">{item.mean?.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                      
                      {!item.isNumeric && item.uniqueValues.length > 0 && (
                        <div>
                          <span className="text-vercel-gray block mb-1">Sample Values:</span>
                          <div className="bg-vercel-bg rounded px-2 py-1 max-h-20 overflow-y-auto">
                            {item.uniqueValues.slice(0, 5).map((val: any, i: number) => (
                              <div key={i} className="font-mono text-[10px] text-vercel-black truncate">
                                {String(val)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExpressionBuilder;
