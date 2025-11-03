import React, { useState } from 'react';

const SavedQueries = ({ savedQueries, onLoadQuery, onDeleteQuery, onClose, onOperationComplete, graphData }) => {
  const [selectedQueries, setSelectedQueries] = useState([]);
  const [showOperations, setShowOperations] = useState(false);

  const handleQuerySelect = (queryId) => {
    if (selectedQueries.includes(queryId)) {
      setSelectedQueries(selectedQueries.filter(id => id !== queryId));
    } else if (selectedQueries.length < 2) {
      setSelectedQueries([...selectedQueries, queryId]);
    }
  };
  
  const getSelectionLabel = (queryId) => {
    const index = selectedQueries.indexOf(queryId);
    if (index === 0) return 'A';
    if (index === 1) return 'B';
    return null;
  };

  const handleSelectAll = () => {
    if (selectedQueries.length === savedQueries.length) {
      setSelectedQueries([]);
    } else {
      setSelectedQueries(savedQueries.slice(0, 2).map(q => q.id));
    }
  };

  const getSelectedQueries = () => {
    return selectedQueries.map(id => savedQueries.find(q => q.id === id)).filter(Boolean);
  };

  const getNodesFromQuery = (query) => {
    if (!graphData || !query.state || !query.state.filteredNodes) {
      return [];
    }
    return query.state.filteredNodes;
  };

  const performSetOperation = (operation, queries) => {
    if (queries.length < 2 && operation !== 'connect') return [];

    const nodeSets = queries.map(q => {
      const nodes = getNodesFromQuery(q);
      return new Set(nodes.map(n => n.id));
    });

    let resultNodeIds = new Set();

    if (operation === 'union') {
      nodeSets.forEach(set => {
        set.forEach(id => resultNodeIds.add(id));
      });
    } else if (operation === 'intersect') {
      resultNodeIds = new Set(nodeSets[0]);
      for (let i = 1; i < nodeSets.length; i++) {
        resultNodeIds = new Set([...resultNodeIds].filter(id => nodeSets[i].has(id)));
      }
    } else if (operation === 'subtract') {
      resultNodeIds = new Set(nodeSets[0]);
      for (let i = 1; i < nodeSets.length; i++) {
        nodeSets[i].forEach(id => resultNodeIds.delete(id));
      }
    }

    return graphData.nodes.filter(n => resultNodeIds.has(n.id));
  };

  const findShortestPathToAnyTarget = (startId, targetIdSet, maxDepth = 5) => {
    if (targetIdSet.has(startId)) {
      const node = graphData.nodes.find(n => n.id === startId);
      return { path: [node], distance: 0, endNode: node };
    }

    const visited = new Set();
    const queue = [{ nodeId: startId, path: [startId], edges: [], distance: 0 }];
    
    while (queue.length > 0) {
      const { nodeId, path, edges, distance } = queue.shift();
      
      if (distance > maxDepth) continue;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const connectedEdges = graphData.links.filter(
        link => link.source === nodeId || link.target === nodeId
      );

      for (const edge of connectedEdges) {
        const nextNodeId = edge.source === nodeId ? edge.target : edge.source;
        
        if (targetIdSet.has(nextNodeId)) {
          const fullPath = [...path, nextNodeId];
          const fullEdges = [...edges, edge];
          const pathNodes = fullPath.map(id => graphData.nodes.find(n => n.id === id));
          const pathWithEdges = [];
          for (let i = 0; i < pathNodes.length; i++) {
            pathWithEdges.push(pathNodes[i]);
            if (i < fullEdges.length) pathWithEdges.push(fullEdges[i]);
          }
          const endNode = graphData.nodes.find(n => n.id === nextNodeId);
          return { path: pathWithEdges, distance: distance + 1, endNode };
        }

        if (!visited.has(nextNodeId)) {
          queue.push({
            nodeId: nextNodeId,
            path: [...path, nextNodeId],
            edges: [...edges, edge],
            distance: distance + 1
          });
        }
      }
    }

    return null;
  };

  const performConnect = async (queries, onProgress) => {
    if (!graphData || queries.length === 0) {
      return [];
    }

    const BATCH_SIZE = 10;
    
    const processBatch = (startNodes, targetIdSet, startIndex, paths) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const endIndex = Math.min(startIndex + BATCH_SIZE, startNodes.length);
          
          for (let i = startIndex; i < endIndex; i++) {
            const startNode = startNodes[i];
            const pathResult = findShortestPathToAnyTarget(startNode.id, targetIdSet);
            if (pathResult) {
              paths.push({
                id: `path-${startNode.id}-${pathResult.endNode.id}`,
                startNode,
                endNode: pathResult.endNode,
                path: pathResult.path,
                totalDistance: pathResult.distance
              });
            }
          }
          
          resolve(endIndex);
        }, 0);
      });
    };

    if (queries.length === 1) {
      const nodes = getNodesFromQuery(queries[0]);
      const paths = [];
      const nodeIdSet = new Set(nodes.map(n => n.id));
      
      let processedCount = 0;
      while (processedCount < nodes.length) {
        const startNode = nodes[processedCount];
        const otherNodesSet = new Set([...nodeIdSet]);
        otherNodesSet.delete(startNode.id);
        
        processedCount = await processBatch(
          nodes.map(n => ({ ...n, targetSet: otherNodesSet })), 
          otherNodesSet,
          processedCount, 
          paths
        );
        
        if (onProgress) {
          onProgress(processedCount, nodes.length);
        }
      }
      
      return paths.sort((a, b) => a.totalDistance - b.totalDistance);
    } else {
      const query1Nodes = getNodesFromQuery(queries[0]);
      const query2Nodes = getNodesFromQuery(queries[1]);
      const paths = [];
      const query2NodeIdSet = new Set(query2Nodes.map(n => n.id));
      
      let processedCount = 0;
      while (processedCount < query1Nodes.length) {
        processedCount = await processBatch(query1Nodes, query2NodeIdSet, processedCount, paths);
        
        if (onProgress) {
          onProgress(processedCount, query1Nodes.length);
        }
      }

      return paths.sort((a, b) => a.totalDistance - b.totalDistance);
    }
  };

  const handleOperation = async (operation) => {
    const selected = getSelectedQueries();
    
    if (operation === 'connect') {
      const paths = await performConnect(selected, (current, total) => {
        if (onOperationComplete) {
          onOperationComplete({
            type: 'connect-progress',
            progress: { current, total }
          });
        }
      });
      if (onOperationComplete) {
        onOperationComplete({
          type: 'connect',
          paths,
          label: `Connect: ${selected.map(q => q.name).join(' ⟷ ')}`,
          sourceQueryIds: selected.map(q => q.id)
        });
      }
      setSelectedQueries([]);
      onClose();
    } else {
      const resultNodes = performSetOperation(operation, selected);
      if (onOperationComplete) {
        onOperationComplete({
          type: operation,
          nodes: resultNodes,
          label: `${operation.toUpperCase()}: ${selected.map(q => q.name).join(` ${operation === 'union' ? '∪' : operation === 'intersect' ? '∩' : '−'} `)}`,
          sourceQueryIds: selected.map(q => q.id)
        });
      }
      setSelectedQueries([]);
      onClose();
    }
  };

  return (
    <div className="bg-white rounded shadow-sm border border-vercel-border max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-vercel-border">
        <h3 className="text-sm font-mono font-semibold text-vercel-black">Saved Queries</h3>
        <button
          onClick={onClose}
          className="text-vercel-gray hover:text-vercel-black transition-colors"
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
            <div className="text-center text-vercel-gray">
              <div className="text-sm font-mono mb-2">No saved queries</div>
              <div className="text-xs font-mono">Save a query to see it here</div>
            </div>
          </div>
        ) : (
          <>
            {/* Query List Header */}
            <div className="px-4 py-3 border-b border-vercel-border bg-vercel-bg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedQueries.length === Math.min(2, savedQueries.length) && savedQueries.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-vercel-border text-vercel-black focus:ring-vercel-black"
                  />
                  <span className="text-xs font-mono text-vercel-black">
                    {selectedQueries.length > 0 ? `${selectedQueries.length} selected` : 'Select queries'}
                  </span>
                </div>
                <button
                  onClick={() => setShowOperations(!showOperations)}
                  className="text-xs font-mono text-vercel-black hover:text-vercel-gray transition-colors">
                >
                  Operations {showOperations ? '▼' : '▶'}
                </button>
              </div>
            </div>

            {/* Operations Panel */}
            {showOperations && (
              <div className="px-4 py-3 border-b border-vercel-border bg-vercel-bg">
                <div className="text-xs font-mono text-vercel-black mb-2">Graph Operations:</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleOperation('union')}
                    disabled={selectedQueries.length < 2}
                    className="px-2 py-1 text-xs font-mono bg-white border border-vercel-border text-vercel-black rounded hover:bg-vercel-bg disabled:opacity-30 transition-colors"
                    title="Combine all selected queries"
                  >
                    ∪ Union
                  </button>
                  <button
                    onClick={() => handleOperation('intersect')}
                    disabled={selectedQueries.length < 2}
                    className="px-2 py-1 text-xs font-mono bg-white border border-vercel-border text-vercel-black rounded hover:bg-vercel-bg disabled:opacity-30 transition-colors"
                    title="Find common elements in selected queries"
                  >
                    ∩ Intersect
                  </button>
                  <button
                    onClick={() => handleOperation('subtract')}
                    disabled={selectedQueries.length < 2}
                    className="px-2 py-1 text-xs font-mono bg-white border border-vercel-border text-vercel-black rounded hover:bg-vercel-bg disabled:opacity-30 transition-colors"
                    title="Remove second query from first"
                  >
                    − Subtract
                  </button>
                  <button
                    onClick={() => handleOperation('connect')}
                    disabled={selectedQueries.length < 1}
                    className="px-2 py-1 text-xs font-mono bg-white border border-vercel-border text-vercel-black rounded hover:bg-vercel-bg disabled:opacity-30 transition-colors"
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
                    className={`border rounded p-3 transition-all ${
                      selectedQueries.includes(query.id)
                        ? 'border-vercel-black bg-vercel-bg'
                        : 'border-vercel-border hover:border-vercel-gray hover:bg-vercel-bg'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div 
                        onClick={() => handleQuerySelect(query.id)}
                        className={`mt-1 w-4 h-4 rounded border cursor-pointer flex items-center justify-center ${
                          selectedQueries.includes(query.id)
                            ? 'bg-vercel-black border-vercel-black'
                            : 'border-vercel-border hover:border-vercel-gray'
                        }`}
                      >
                        {getSelectionLabel(query.id) && (
                          <span className="text-[10px] font-bold text-white">
                            {getSelectionLabel(query.id)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-mono font-medium text-xs text-vercel-black truncate">{query.name}</h4>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={() => onLoadQuery(query)}
                              className="text-vercel-black hover:text-vercel-gray transition-colors"
                              title="Load this query"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                            <button
                              onClick={() => onDeleteQuery(query.id)}
                              className="text-vercel-gray hover:text-vercel-black transition-colors"
                              title="Delete this query"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        
                        <div className="mt-1">
                          <div className="text-xs font-mono text-vercel-black bg-vercel-bg px-2 py-1 rounded border border-vercel-border">
                            {query.query.join(' → ')}
                          </div>
                        </div>
                        
                        {query.notes && (
                          <div className="mt-2 text-xs font-mono text-vercel-gray">
                            {query.notes}
                          </div>
                        )}
                        
                        <div className="mt-2 text-xs font-mono text-vercel-light-gray">
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
      <div className="border-t border-vercel-border px-4 py-3 bg-vercel-bg">
        <div className="flex justify-between items-center text-xs font-mono text-white">
          <span>{savedQueries.length} saved queries</span>
          {selectedQueries.length > 0 && (
            <span className="text-white font-mono">{selectedQueries.length} selected</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SavedQueries; 