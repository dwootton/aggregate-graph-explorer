import React, { useState } from 'react';
/**
 * @typedef {import('../types').Filter} Filter
 * @typedef {import('../types').ActiveFilters} ActiveFilters
 */



// Nested Query Step with Expandable Filters Component
/**
 * @param {{ step: string, index: number, activeFilters: ActiveFilters, onClick: ()=>void, onRemove: ()=>void, onRemoveFilter: (type: 'nodeFilters'|'edgeFilters', attribute: string, queryStep?: number|null, queryContext?: string|null)=>void }} props
 */
const QueryStepWithFilters = ({ step, index, activeFilters, onClick, onRemove, onRemoveFilter }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Get filters that were created specifically for this query step
  const relevantFilters = [
    ...activeFilters.nodeFilters.filter(filter => filter.queryStep === index),
    ...activeFilters.edgeFilters.filter(filter => filter.queryStep === index)
  ];
  
  // Determine filter type based on step position for new filters (not used for display)
  const isNodeStep = index % 2 === 0;
  const filterType = isNodeStep ? 'nodeFilters' : 'edgeFilters';

  // Color code query path: nodes (even steps) = blue, edges (odd steps) = green
  const stepColor = isNodeStep 
    ? 'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100' 
    : 'bg-green-50 border-green-300 text-green-800 hover:bg-green-100';
    
  const hasFilters = relevantFilters.length > 0;

  return (
    <div className="flex flex-col">
      {/* Main Query Step Container */}
      <div className={`rounded-lg border-2 ${stepColor} shadow-sm transition-all duration-200 overflow-hidden`}>
        {/* Query Step Header */}
        <div className="flex items-center justify-between p-3">
          <div 
            className="flex items-center gap-2 cursor-pointer flex-1"
            onClick={onClick}
            title={`Navigate to: ${step}`}
          >
            <span className="font-semibold text-sm">{step}</span>
            {hasFilters && (
              <span className="text-xs bg-white rounded-full px-2 py-0.5 font-medium">
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
                className="p-1 rounded hover:bg-white hover:bg-opacity-50 transition-colors"
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
              className="p-1 rounded hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors"
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
          <div className="border-t border-current border-opacity-20 bg-white bg-opacity-30">
            <div className="p-3 space-y-2">
              <div className="text-xs font-medium opacity-75 uppercase tracking-wide">
                Active Filters:
              </div>
              {relevantFilters.map((filter, filterIndex) => (
                <div 
                  key={filterIndex}
                  className="flex items-center justify-between py-1.5 px-2 bg-white rounded text-sm"
                >
                  <span className="font-medium text-gray-700">
                    {getFilterDisplayText(filter)}
                  </span>
                  <button
                      onClick={(e) => {
                        e.stopPropagation();
                      onRemoveFilter(filterType, filter.attribute, filter.queryStep, filter.queryContext);
                    }}
                    className="ml-2 p-0.5 rounded text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
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
 *  onRemoveFilter: (type: 'nodeFilters'|'edgeFilters', attribute: string, queryStep?: number|null)=>void
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
  onRemoveFilter  // NEW: Callback to remove active filters
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
    console.log(`Removing query part at index ${index}:`, {
      removedPart: currentQuery[index],
      remainingParts: currentQuery.length - 1
    });
    
    const newQuery = currentQuery.filter((_, i) => i !== index);
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
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-7xl mx-auto">
        {/* Query Display */}
        <div className="flex items-start gap-4 mb-4">
          <label className="text-sm font-medium text-gray-700 mt-3">Query Path:</label>
          <div className="flex-1 min-h-[60px]">
            {currentQuery.length === 0 ? (
              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 text-center">
                <span className="text-gray-400 text-sm">Start by selecting a node type...</span>
              </div>
            ) : (
              <div className="flex items-start gap-4 flex-wrap">
                {currentQuery.map((part, index) => (
                  <div key={index} className="flex items-start gap-3">
                    {index > 0 && (
                      <div className="mt-6 text-gray-400 font-semibold">→</div>
                    )}
                    <QueryStepWithFilters
                      step={part}
                      index={index}
                      activeFilters={activeFilters}
                      onClick={() => handleQueryPillClick(index)}
                      onRemove={() => removeQueryPart(index)}
                      onRemoveFilter={onRemoveFilter}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Query Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                console.log('Query reset requested');
                onReset();
              }}
              disabled={currentQuery.length === 0}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Reset
            </button>
            
            <button
              onClick={() => {
                console.log('Save dialog opened');
                setShowSaveDialog(true);
              }}
              disabled={currentQuery.length === 0 || isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Query'}
            </button>

            <button
              onClick={() => {
                console.log('Saved queries panel toggled');
                onToggleSavedQueries();
              }}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Saved Queries
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Query depth: {currentQuery.length}</span>
          </div>
        </div>


      </div>

      {/* Save Dialog Modal */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Save Query</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Query Name
                </label>
                <input
                  type="text"
                  value={queryName}
                  onChange={(e) => setQueryName(e.target.value)}
                  placeholder="Enter a name for this query..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSaving}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={queryNotes}
                  onChange={(e) => setQueryNotes(e.target.value)}
                  placeholder="Add notes about this query..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSaving}
                />
              </div>

              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
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
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!queryName.trim() || isSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
