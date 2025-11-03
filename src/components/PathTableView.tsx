import React, { useState, useMemo } from 'react';
import { GraphNode, GraphLink } from '../types';
import { CustomHistogram, CustomSearch } from './CustomCharts';

interface PathResult {
  id: string;
  startNode: GraphNode;
  endNode: GraphNode;
  path: Array<GraphNode | GraphLink>;
  totalDistance: number;
}

interface PathTableViewProps {
  paths: PathResult[];
}

const PathTableView: React.FC<PathTableViewProps> = ({ paths }) => {
  const [sortConfig, setSortConfig] = useState<{ key: 'distance' | 'start' | 'end'; direction: 'asc' | 'desc' }>({
    key: 'distance',
    direction: 'asc'
  });
  
  const [filters, setFilters] = useState<{
    distance: { min?: number; max?: number } | null;
    startNodes: Set<string>;
    endNodes: Set<string>;
  }>({
    distance: null,
    startNodes: new Set(),
    endNodes: new Set()
  });
  
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const getNodeDisplayName = (node: GraphNode): string | null => {
    const commonNameFields = ['name', 'Name', 'title', 'Title', 'label', 'Label'];
    for (const field of commonNameFields) {
      if (node[field] && typeof node[field] === 'string') {
        return node[field] as string;
      }
    }
    return null;
  };

  const filteredAndSortedPaths = useMemo(() => {
    let filtered = [...paths];
    
    if (filters.distance) {
      filtered = filtered.filter(p => {
        if (filters.distance!.min !== undefined && p.totalDistance < filters.distance!.min) return false;
        if (filters.distance!.max !== undefined && p.totalDistance > filters.distance!.max) return false;
        return true;
      });
    }
    
    if (filters.startNodes.size > 0) {
      filtered = filtered.filter(p => filters.startNodes.has(p.startNode.id));
    }
    
    if (filters.endNodes.size > 0) {
      filtered = filtered.filter(p => filters.endNodes.has(p.endNode.id));
    }
    
    setCurrentPage(1);
    
    const sorted = filtered;
    sorted.sort((a, b) => {
      let compareA: any;
      let compareB: any;

      if (sortConfig.key === 'distance') {
        compareA = a.totalDistance;
        compareB = b.totalDistance;
      } else if (sortConfig.key === 'start') {
        compareA = a.startNode.id;
        compareB = b.startNode.id;
      } else if (sortConfig.key === 'end') {
        compareA = a.endNode.id;
        compareB = b.endNode.id;
      }

      if (compareA < compareB) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (compareA > compareB) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return sorted;
  }, [paths, sortConfig, filters]);

  const paginatedPaths = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredAndSortedPaths.slice(startIndex, endIndex);
  }, [filteredAndSortedPaths, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredAndSortedPaths.length / pageSize);

  const handleSort = (key: 'distance' | 'start' | 'end') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const formatPath = (path: Array<GraphNode | GraphLink>) => {
    const elements: string[] = [];
    for (const item of path) {
      if ('Node Type' in item) {
        const node = item as GraphNode;
        elements.push(`${node['Node Type']}:${node.id}`);
      } else if ('Edge Type' in item) {
        const edge = item as GraphLink;
        elements.push(`[${edge['Edge Type']}]`);
      }
    }
    return elements.join(' → ');
  };

  const distanceData = useMemo(() => {
    return paths.map(p => ({ distance: p.totalDistance }));
  }, [paths]);

  const distanceAttribute = useMemo(() => ({
    name: 'distance',
    type: 'numeric' as const,
    isNumeric: true,
    isBoolean: false,
    cardinality: new Set(paths.map(p => p.totalDistance)).size,
    completeness: 100,
    min: paths.length > 0 ? Math.min(...paths.map(p => p.totalDistance)) : 0,
    max: paths.length > 0 ? Math.max(...paths.map(p => p.totalDistance)) : 0,
    mean: paths.length > 0 ? paths.reduce((sum, p) => sum + p.totalDistance, 0) / paths.length : 0,
    uniqueValues: [],
    distribution: {}
  }), [paths]);

  const startNodeData = useMemo(() => {
    return paths.map(p => ({
      nodeId: p.startNode.id,
      nodeName: getNodeDisplayName(p.startNode) || p.startNode.id
    }));
  }, [paths]);

  const startNodeAttribute = useMemo(() => ({
    name: 'nodeName',
    type: 'string' as const,
    isNumeric: false,
    isBoolean: false,
    cardinality: new Set(paths.map(p => p.startNode.id)).size,
    completeness: 100,
    uniqueValues: Array.from(new Set(paths.map(p => getNodeDisplayName(p.startNode) || p.startNode.id))),
    distribution: {}
  }), [paths]);

  const endNodeData = useMemo(() => {
    return paths.map(p => ({
      nodeId: p.endNode.id,
      nodeName: getNodeDisplayName(p.endNode) || p.endNode.id
    }));
  }, [paths]);

  const endNodeAttribute = useMemo(() => ({
    name: 'nodeName',
    type: 'string' as const,
    isNumeric: false,
    isBoolean: false,
    cardinality: new Set(paths.map(p => p.endNode.id)).size,
    completeness: 100,
    uniqueValues: Array.from(new Set(paths.map(p => getNodeDisplayName(p.endNode) || p.endNode.id))),
    distribution: {}
  }), [paths]);

  const SortIcon = ({ column }: { column: 'distance' | 'start' | 'end' }) => {
    if (sortConfig.key !== column) {
      return (
        <svg className="w-3 h-3 text-vercel-light-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortConfig.direction === 'asc' ? (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  if (paths.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-vercel-gray">
          <div className="text-sm font-mono mb-2">No paths found</div>
          <div className="text-xs font-mono">Try connecting different queries</div>
        </div>
      </div>
    );
  }

  const hasActiveFilters = filters.distance !== null || filters.startNodes.size > 0 || filters.endNodes.size > 0;

  return (
    <div className="h-full flex flex-col bg-white border border-vercel-border rounded">
      {/* Header */}
      <div className="px-4 py-3 border-b border-vercel-border bg-vercel-bg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-mono font-semibold text-vercel-black">
              Connection Paths ({filteredAndSortedPaths.length}{paths.length !== filteredAndSortedPaths.length ? ` of ${paths.length}` : ''})
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-vercel-gray">
              Sorted by {sortConfig.key} ({sortConfig.direction})
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                showFilters || hasActiveFilters
                  ? 'bg-vercel-black text-white'
                  : 'bg-white border border-vercel-border text-vercel-black hover:bg-vercel-bg'
              }`}
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
              {hasActiveFilters && !showFilters && ' (Active)'}
            </button>
            {hasActiveFilters && (
              <button
                onClick={() => setFilters({ distance: null, startNodes: new Set(), endNodes: new Set() })}
                className="px-2 py-1 text-xs font-mono bg-white border border-vercel-border text-vercel-black rounded hover:bg-vercel-bg transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="border-b border-vercel-border bg-white p-4">
          <div className="grid grid-cols-3 gap-6">
            {/* Distance Filter */}
            <div>
              <div className="text-xs font-mono font-medium text-vercel-black mb-3">
                Distance (# hops)
              </div>
              <CustomHistogram
                data={distanceData}
                attribute={distanceAttribute}
                onBrushChange={(min: number, max: number) => {
                  setFilters(prev => ({
                    ...prev,
                    distance: { min, max }
                  }));
                }}
                currentFilter={filters.distance ? {
                  attribute: 'distance',
                  type: 'range' as const,
                  queryStep: 0,
                  queryContext: '',
                  min: filters.distance.min,
                  max: filters.distance.max
                } : undefined}
                theme="blue"
                width={280}
                height={120}
              />
            </div>
            
            {/* Start Node Filter */}
            <div>
              <div className="text-xs font-mono font-medium text-vercel-black mb-2">
                Start Node
              </div>
              <div className="text-[10px] font-mono text-vercel-gray mb-3">
                {startNodeAttribute.cardinality} unique nodes
              </div>
              <CustomSearch
                data={startNodeData}
                attribute={startNodeAttribute}
                onSelectionChange={(selectedValues: string[]) => {
                  const selectedIds = new Set(
                    paths
                      .filter(p => selectedValues.includes(getNodeDisplayName(p.startNode) || p.startNode.id))
                      .map(p => p.startNode.id)
                  );
                  setFilters(prev => ({
                    ...prev,
                    startNodes: selectedIds
                  }));
                }}
                currentFilter={filters.startNodes.size > 0 ? {
                  attribute: 'nodeName',
                  type: 'categorical' as const,
                  queryStep: 0,
                  queryContext: '',
                  values: Array.from(filters.startNodes)
                } : undefined}
              />
            </div>
            
            {/* End Node Filter */}
            <div>
              <div className="text-xs font-mono font-medium text-vercel-black mb-2">
                End Node
              </div>
              <div className="text-[10px] font-mono text-vercel-gray mb-3">
                {endNodeAttribute.cardinality} unique nodes
              </div>
              <CustomSearch
                data={endNodeData}
                attribute={endNodeAttribute}
                onSelectionChange={(selectedValues: string[]) => {
                  const selectedIds = new Set(
                    paths
                      .filter(p => selectedValues.includes(getNodeDisplayName(p.endNode) || p.endNode.id))
                      .map(p => p.endNode.id)
                  );
                  setFilters(prev => ({
                    ...prev,
                    endNodes: selectedIds
                  }));
                }}
                currentFilter={filters.endNodes.size > 0 ? {
                  attribute: 'nodeName',
                  type: 'categorical' as const,
                  queryStep: 0,
                  queryContext: '',
                  values: Array.from(filters.endNodes)
                } : undefined}
              />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Table Header */}
        <div className="bg-vercel-bg border-b border-vercel-border">
          <div className="flex text-xs font-mono font-medium text-vercel-gray">
            <div className="px-4 py-2 w-24 flex-shrink-0">
              <button
                onClick={() => handleSort('distance')}
                className="flex items-center gap-1 hover:text-vercel-black transition-colors"
              >
                Distance
                <SortIcon column="distance" />
              </button>
            </div>
            <div className="px-4 py-2 w-64 flex-shrink-0">
              <button
                onClick={() => handleSort('start')}
                className="flex items-center gap-1 hover:text-vercel-black transition-colors"
              >
                Start Node
                <SortIcon column="start" />
              </button>
            </div>
            <div className="px-4 py-2 flex-1">Path</div>
            <div className="px-4 py-2 w-64 flex-shrink-0">
              <button
                onClick={() => handleSort('end')}
                className="flex items-center gap-1 hover:text-vercel-black transition-colors"
              >
                End Node
                <SortIcon column="end" />
              </button>
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs font-mono">
            <tbody>
              {paginatedPaths.map((pathResult, index) => (
                <tr
                  key={pathResult.id}
                  className={`border-b border-vercel-border hover:bg-vercel-bg transition-colors ${
                    index % 2 === 0 ? 'bg-white' : 'bg-vercel-bg bg-opacity-30'
                  }`}
                >
                  <td className="px-4 py-3 w-24 text-vercel-black font-medium">
                    {pathResult.totalDistance}
                  </td>
                  <td className="px-4 py-3 w-64">
                    <div className="flex flex-col gap-1">
                      <div className="text-vercel-black font-medium text-[11px]">
                        {pathResult.startNode['Node Type']}
                      </div>
                      {getNodeDisplayName(pathResult.startNode) && (
                        <div className="text-vercel-black font-semibold text-xs truncate">
                          {getNodeDisplayName(pathResult.startNode)}
                        </div>
                      )}
                      <div className="text-vercel-gray text-[10px] truncate">
                        ID: {pathResult.startNode.id}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-vercel-gray">
                    <div className="truncate" title={formatPath(pathResult.path)}>
                      {formatPath(pathResult.path)}
                    </div>
                  </td>
                  <td className="px-4 py-3 w-64">
                    <div className="flex flex-col gap-1">
                      <div className="text-vercel-black font-medium text-[11px]">
                        {pathResult.endNode['Node Type']}
                      </div>
                      {getNodeDisplayName(pathResult.endNode) && (
                        <div className="text-vercel-black font-semibold text-xs truncate">
                          {getNodeDisplayName(pathResult.endNode)}
                        </div>
                      )}
                      <div className="text-vercel-gray text-[10px] truncate">
                        ID: {pathResult.endNode.id}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="border-t border-vercel-border bg-vercel-bg px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-vercel-gray">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-vercel-border rounded px-2 py-1 text-vercel-black bg-white"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-xs font-mono text-vercel-gray">
                Page {currentPage} of {totalPages} ({filteredAndSortedPaths.length} total)
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-xs font-mono border border-vercel-border rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="First page"
                >
                  ««
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-xs font-mono border border-vercel-border rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Previous page"
                >
                  ‹
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 text-xs font-mono border border-vercel-border rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Next page"
                >
                  ›
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 text-xs font-mono border border-vercel-border rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Last page"
                >
                  »»
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PathTableView;
