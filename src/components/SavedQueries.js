import React, { useState } from 'react';

const SavedQueries = ({ savedQueries, onLoadQuery, onDeleteQuery, onClose }) => {
  const [selectedQueries, setSelectedQueries] = useState(new Set());
  const [showOperations, setShowOperations] = useState(false);

  const handleQuerySelect = (queryId) => {
    const newSelected = new Set(selectedQueries);
    if (newSelected.has(queryId)) {
      newSelected.delete(queryId);
    } else {
      newSelected.add(queryId);
    }
    setSelectedQueries(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedQueries.size === savedQueries.length) {
      setSelectedQueries(new Set());
    } else {
      setSelectedQueries(new Set(savedQueries.map(q => q.id)));
    }
  };

  const getSelectedQueries = () => {
    return savedQueries.filter(q => selectedQueries.has(q.id));
  };

  const handleOperation = (operation) => {
    const selected = getSelectedQueries();
    console.log(`Performing ${operation} on:`, selected);
    // TODO: Implement actual graph operations
    // This would be where you'd implement union, intersection, etc.
    alert(`${operation} operation would be performed on ${selected.length} queries`);
  };

  return (
    <div className="bg-white rounded-lg shadow-xl border border-gray-200 max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Saved Queries</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Close panel"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {savedQueries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center text-gray-500">
              <div className="text-lg mb-2">No saved queries</div>
              <div className="text-sm">Save a query to see it here</div>
            </div>
          </div>
        ) : (
          <>
            {/* Query List Header */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedQueries.size === savedQueries.length && savedQueries.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {selectedQueries.size > 0 ? `${selectedQueries.size} selected` : 'Select queries'}
                  </span>
                </div>
                <button
                  onClick={() => setShowOperations(!showOperations)}
                  className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Operations {showOperations ? '▼' : '▶'}
                </button>
              </div>
            </div>

            {/* Operations Panel */}
            {showOperations && (
              <div className="px-4 py-3 border-b border-gray-100 bg-blue-50">
                <div className="text-xs text-blue-700 mb-2">Graph Operations:</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleOperation('union')}
                    disabled={selectedQueries.size < 2}
                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors"
                    title="Combine all selected queries"
                  >
                    ∪ Union
                  </button>
                  <button
                    onClick={() => handleOperation('intersect')}
                    disabled={selectedQueries.size < 2}
                    className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50 transition-colors"
                    title="Find common elements in selected queries"
                  >
                    ∩ Intersect
                  </button>
                  <button
                    onClick={() => handleOperation('subtract')}
                    disabled={selectedQueries.size < 2}
                    className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 transition-colors"
                    title="Remove second query from first"
                  >
                    − Subtract
                  </button>
                  <button
                    onClick={() => handleOperation('connect')}
                    disabled={selectedQueries.size < 1}
                    className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50 transition-colors"
                    title="Find connections between queries"
                  >
                    ⟷ Connect
                  </button>
                </div>
              </div>
            )}

            {/* Query List */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-2 p-4">
                {savedQueries.map((query) => (
                  <div
                    key={query.id}
                    className={`border rounded-lg p-3 transition-all ${
                      selectedQueries.has(query.id)
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedQueries.has(query.id)}
                        onChange={() => handleQuerySelect(query.id)}
                        className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-gray-900 truncate">{query.name}</h4>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={() => onLoadQuery(query)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title="Load this query"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                            <button
                              onClick={() => onDeleteQuery(query.id)}
                              className="text-red-600 hover:text-red-800 transition-colors"
                              title="Delete this query"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        
                        <div className="mt-1">
                          <div className="text-sm text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded">
                            {query.query.join(' → ')}
                          </div>
                        </div>
                        
                        {query.notes && (
                          <div className="mt-2 text-sm text-gray-600">
                            {query.notes}
                          </div>
                        )}
                        
                        <div className="mt-2 text-xs text-gray-400">
                          Saved {new Date(query.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>{savedQueries.length} saved queries</span>
          {selectedQueries.size > 0 && (
            <span className="text-blue-600">{selectedQueries.size} selected</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SavedQueries; 