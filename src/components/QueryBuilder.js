import React, { useState } from 'react';
/**
 * @typedef {import('../types').Filter} Filter
 * @typedef {import('../types').ActiveFilters} ActiveFilters
 */



// Nested Query Step with Expandable Filters Component
/**
 * @param {{ step: string, index: number, activeFilters: ActiveFilters, onClick: ()=>void, onRemove: ()=>void, onRemoveFilter: (type: 'nodeFilters'|'edgeFilters', attribute: string, queryStep?: number|null, queryContext?: string|null)=>void, isDeriveStart?: boolean }} props
 */
const QueryStepWithFilters = ({ step, index, activeFilters, onClick, onRemove, onRemoveFilter, isDeriveStart }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Get filters that were created specifically for this query step
  const relevantFilters = [
    ...activeFilters.nodeFilters.filter(filter => filter.queryStep === index),
    ...activeFilters.edgeFilters.filter(filter => filter.queryStep === index)
  ];
  
  // Determine filter type based on step position for new filters (not used for display)
  const isNodeStep = index % 2 === 0;
  const filterType = isNodeStep ? 'nodeFilters' : 'edgeFilters';

  // Color code query path: nodes (even steps) = black/white, edges (odd steps) = gray
  // Add double stroke for derive start node
  const stepColor = isNodeStep 
    ? 'bg-white border-vercel-border text-vercel-black hover:bg-vercel-bg' 
    : 'bg-vercel-bg border-vercel-border text-vercel-black hover:bg-white';
  
  const borderStyle = isDeriveStart ? 'border-2 border-double' : 'border';
    
  const hasFilters = relevantFilters.length > 0;

  return (
    <div className="flex flex-col">
      {/* Main Query Step Container */}
      <div className={`rounded ${borderStyle} ${stepColor} transition-all duration-200 overflow-hidden`}>
        {/* Query Step Header */}
        <div className="flex items-center justify-between p-3">
          <div 
            className="flex items-center gap-2 cursor-pointer flex-1"
            onClick={onClick}
            title={`Navigate to: ${step}`}
          >
            <span className="font-mono text-sm font-medium">{step}</span>
            {hasFilters && (
              <span className="text-xs font-mono bg-vercel-black text-white rounded-full px-2 py-0.5">
                {relevantFilters.length} filter{relevantFilters.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {/* Expand/Collapse Button */}
            {hasFilters && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="p-1 rounded hover:bg-vercel-black hover:bg-opacity-5 transition-colors"
                title={isExpanded ? "Collapse filters" : "Expand filters"}
              >
                <svg 
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            
            {/* Remove Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-1 rounded hover:bg-vercel-black hover:bg-opacity-5 text-vercel-gray hover:text-vercel-black transition-colors"
              title="Remove this step"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Expandable Filter List */}
        {hasFilters && isExpanded && (
          <div className="border-t border-vercel-border bg-vercel-bg bg-opacity-50">
            <div className="p-3 space-y-2">
              <div className="text-xs font-mono text-vercel-gray uppercase tracking-wide">
                Active Filters:
              </div>
              {relevantFilters.map((filter, filterIndex) => (
                <div 
                  key={filterIndex}
                  className="flex items-center justify-between py-1.5 px-2 bg-white border border-vercel-border rounded text-sm"
                >
                  <span className="font-mono text-xs text-vercel-black">
                    {getFilterDisplayText(filter)}
                  </span>
                  <button
                      onClick={(e) => {
                        e.stopPropagation();
                      onRemoveFilter(filterType, filter.attribute, filter.queryStep, filter.queryContext);
                    }}
                    className="ml-2 p-0.5 rounded text-vercel-gray hover:text-vercel-black hover:bg-vercel-bg transition-colors"
                    title="Remove filter"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to format filter display text with query step context
/**
 * @param {Filter} filter
 */
const getFilterDisplayText = (filter) => {
  let baseText;
  switch (filter.type) {
    case 'range':
      baseText = `${filter.attribute}: ${filter.min}-${filter.max}`;
      break;
    case 'categorical':
      const values = filter.values.length > 2 
        ? `${filter.values.slice(0, 2).join(', ')}... (+${filter.values.length - 2})`
        : filter.values.join(', ');
      baseText = `${filter.attribute}: ${values}`;
      break;
    case 'search':
      baseText = `${filter.attribute}: "${filter.value}"`;
      break;
    default:
      baseText = `${filter.attribute}: filtered`;
  }
  
  // Add query context to show which step this filter applies to
  const contextSuffix = filter.queryContext ? ` (on ${filter.queryContext})` : '';
  return baseText + contextSuffix;
};

/**
 * @param {{
 *  currentQuery: string[],
 *  onQueryChange: (q: string[])=>void,
 *  onReset: ()=>void,
 *  onSave: (name: string, notes?: string)=>Promise<void>,
 *  onToggleSavedQueries: ()=>void,
 *  onNavigateToQueryIndex: (index: number)=>void,
 *  activeFilters?: ActiveFilters,
 *  onRemoveFilter: (type: 'nodeFilters'|'edgeFilters', attribute: string, queryStep?: number|null)=>void,
 *  deriveStartType?: string|null
 * }} props
 */
const QueryBuilder = ({ 
  currentQuery, 
  onQueryChange, 
  onReset, 
  onSave, 
  onToggleSavedQueries,
  onNavigateToQueryIndex,  // New prop for navigation
  activeFilters = /** @type {ActiveFilters} */({ nodeFilters: [], edgeFilters: [] }),  // New prop for filters
  onRemoveFilter,  // NEW: Callback to remove active filters
  deriveStartType = null  // NEW: Track which node is the derive start
}) => {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [queryName, setQueryName] = useState('');
  const [queryNotes, setQueryNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (queryName.trim()) {
      console.time('Query Save Operation');
      console.log(`Starting query save: "${queryName}"`, {
        queryLength: currentQuery.length,
        queryPath: currentQuery.join(' → '),
        notesLength: queryNotes.length
      });
      
      setIsSaving(true);
      try {
        await onSave(queryName.trim(), queryNotes.trim());
        setQueryName('');
        setQueryNotes('');
        setShowSaveDialog(false);
        
        console.log('Query saved successfully');
        console.timeEnd('Query Save Operation');
      } catch (error) {
        console.error('Error saving query:', error);
        console.timeEnd('Query Save Operation');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleQueryEdit = (index, newValue) => {
    console.log(`Query part edited at index ${index}:`, {
      oldValue: currentQuery[index],
      newValue,
      totalParts: currentQuery.length
    });
    
    const newQuery = [...currentQuery];
    newQuery[index] = newValue;
    onQueryChange(newQuery);
  };

  const removeQueryPart = (index) => {
    console.log('[Path Debug] Removing query part', {
      index,
      removedPart: currentQuery[index],
      from: currentQuery
    });
    // Remove selected step and everything after it to maintain context
    const newQuery = currentQuery.slice(0, index);
    console.log('[Path Debug] New query after removal', { to: newQuery });
    onQueryChange(newQuery);
  };

  // Handle clicking on a query pill to navigate back to that state
  const handleQueryPillClick = (index) => {
    console.log(`Query pill clicked at index ${index}:`, {
      targetQuery: currentQuery.slice(0, index + 1).join(' → '),
      fromQuery: currentQuery.join(' → ')
    });
    
    if (onNavigateToQueryIndex) {
      onNavigateToQueryIndex(index);
    }
  };

  return (
    <div className="bg-white border-b border-vercel-border px-4 py-2">
      <div className="max-w-7xl mx-auto">
        {/* Query Display */}
        <div className="flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <label className="text-xs font-mono text-vercel-gray whitespace-nowrap">Query Path:</label>
            <div className="flex-1">
              {currentQuery.length === 0 ? (
                <div className="px-3 py-2 border border-dashed border-vercel-border rounded bg-vercel-bg text-center">
                  <span className="text-vercel-light-gray text-xs font-mono">Start by selecting a node type...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {currentQuery.map((part, index) => {
                    const isNodeStep = index % 2 === 0;
                    const isDeriveStart = deriveStartType && isNodeStep && part === deriveStartType;
                    
                    return (
                      <div key={index} className="flex items-center gap-2">
                        {index > 0 && (
                          <div className="text-vercel-light-gray font-mono text-sm">→</div>
                        )}
                        <QueryStepWithFilters
                          step={part}
                          index={index}
                          activeFilters={activeFilters}
                          onClick={() => handleQueryPillClick(index)}
                          onRemove={() => removeQueryPart(index)}
                          onRemoveFilter={onRemoveFilter}
                          isDeriveStart={isDeriveStart}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Query Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                console.log('Query reset requested');
                onReset();
              }}
              disabled={currentQuery.length === 0}
              className="px-3 py-1.5 text-xs font-mono text-vercel-black bg-white border border-vercel-border rounded hover:bg-vercel-bg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Reset
            </button>
            
            <button
              onClick={() => {
                console.log('Save dialog opened');
                setShowSaveDialog(true);
              }}
              disabled={currentQuery.length === 0 || isSaving}
              className="px-3 py-1.5 text-xs font-mono text-white bg-vercel-black border border-vercel-black rounded hover:bg-vercel-gray disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Query'}
            </button>

            <button
              onClick={() => {
                console.log('Saved queries panel toggled');
                onToggleSavedQueries();
              }}
              className="px-3 py-1.5 text-xs font-mono text-vercel-black bg-white border border-vercel-border rounded hover:bg-vercel-bg transition-colors"
            >
              Saved Queries
            </button>
            <div className="text-xs font-mono text-vercel-light-gray">
              {currentQuery.length > 0 && `Depth: ${currentQuery.length}`}
            </div>
          </div>
        </div>
      </div>

      {/* Save Dialog Modal */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-vercel-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded border border-vercel-border p-6 w-96 max-w-90vw shadow-sm">
            <h3 className="text-sm font-mono font-semibold text-vercel-black mb-4">Save Query</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-vercel-gray mb-1">
                  Query Name
                </label>
                <input
                  type="text"
                  value={queryName}
                  onChange={(e) => setQueryName(e.target.value)}
                  placeholder="Enter a name for this query..."
                  className="w-full px-3 py-2 text-xs font-mono border border-vercel-border rounded focus:outline-none focus:border-vercel-black"
                  disabled={isSaving}
                />
              </div>
              
              <div>
                <label className="block text-xs font-mono text-vercel-gray mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={queryNotes}
                  onChange={(e) => setQueryNotes(e.target.value)}
                  placeholder="Add notes about this query..."
                  rows={3}
                  className="w-full px-3 py-2 text-xs font-mono border border-vercel-border rounded focus:outline-none focus:border-vercel-black"
                  disabled={isSaving}
                />
              </div>

              <div className="text-xs font-mono text-vercel-gray bg-vercel-bg p-3 rounded border border-vercel-border">
                <strong>Query to save:</strong> {currentQuery.join(' → ')}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  console.log('Save dialog cancelled');
                  setShowSaveDialog(false);
                }}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-mono text-vercel-black bg-white border border-vercel-border rounded hover:bg-vercel-bg disabled:opacity-30 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!queryName.trim() || isSaving}
                className="px-4 py-2 text-xs font-mono text-white bg-vercel-black border border-vercel-black rounded hover:bg-vercel-gray disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueryBuilder; 
