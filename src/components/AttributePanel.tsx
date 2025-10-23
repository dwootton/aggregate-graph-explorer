import React, { useState, useMemo, useCallback } from 'react';
import { CustomHistogram, CustomBarChart, CustomSearch } from './CustomCharts';
import { GraphData, GraphNode, GraphLink, Filter, PendingFilters } from '../types';

// Pending Filters Overlay Component
type OverlayProps = {
  pendingFilters: PendingFilters;
  onFinalize: () => void;
  onRemoveFilter: (type: 'nodeFilters' | 'edgeFilters', attribute: string, queryStep?: number | null, queryContext?: string | null) => void;
  onClearAll: () => void;
};

const PendingFiltersOverlay: React.FC<OverlayProps> = ({ pendingFilters, onFinalize, onRemoveFilter, onClearAll }) => {
  const totalPending = pendingFilters.nodeFilters.length + pendingFilters.edgeFilters.length;
  
  if (totalPending === 0) return null;

  const getFilterDisplayText = (filter: Filter) => {
    let baseText;
    switch (filter.type) {
      case 'range':
        baseText = `${filter.attribute}: ${filter.min}-${filter.max}`;
        break;
      case 'categorical':
        const values = (filter.values || []).length > 2 
          ? `${(filter.values || []).slice(0, 2).join(', ')}... (+${(filter.values || []).length - 2})`
          : (filter.values || []).join(', ');
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

  return (
    <div className="absolute inset-x-0 top-0 z-10 bg-vercel-bg border-l-2 border-vercel-black p-2 m-2 rounded shadow-sm">
      <div className="flex items-center justify-between mb-2">
        
        <div className="flex items-center gap-2">
          <button
            onClick={onFinalize}
            className="px-3 py-1 bg-vercel-black text-white text-xs font-mono rounded hover:bg-vercel-gray transition-colors inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Finalize Filters
          </button>
          <button
            onClick={onClearAll}
            className="px-3 py-1 bg-white border border-vercel-border text-vercel-black text-xs font-mono rounded hover:bg-vercel-bg transition-colors inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            Clear All
          </button>
        </div>
      </div>
      
      <div className="space-y-2">
        {pendingFilters.nodeFilters.length > 0 && (
          <div>
            <span className="text-xs font-mono text-vercel-gray block mb-1">Node Filters:</span>
            <div className="flex flex-wrap gap-2">
              {pendingFilters.nodeFilters.map((filter: Filter, index: number) => (
                <div key={index} className="inline-flex items-center px-2 py-1 bg-white text-vercel-black text-xs font-mono rounded border border-vercel-border">
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                  <span>{getFilterDisplayText(filter)}</span>
                  <button
                    onClick={() => onRemoveFilter('nodeFilters', filter.attribute, filter.queryStep, filter.queryContext)}
                    className="ml-1 text-vercel-gray hover:text-vercel-black"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {pendingFilters.edgeFilters.length > 0 && (
          <div>
            <span className="text-xs font-mono text-vercel-gray block mb-1">Edge Filters:</span>
            <div className="flex flex-wrap gap-2">
              {pendingFilters.edgeFilters.map((filter: Filter, index: number) => (
                <div key={index} className="inline-flex items-center px-2 py-1 bg-white text-vercel-black text-xs font-mono rounded border border-vercel-border">
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                  <span>{getFilterDisplayText(filter)}</span>
                  <button
                    onClick={() => onRemoveFilter('edgeFilters', filter.attribute, filter.queryStep, filter.queryContext)}
                    className="ml-1 text-vercel-gray hover:text-vercel-black"
                  >
                    ×
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

// Performance monitor hook
const usePerformanceMonitor = (name: string) => {
  const start = performance.now();
  React.useEffect(() => {
    return () => {
      const end = performance.now();
      console.log(`${name}: ${(end - start).toFixed(3)}ms`);
    };
  });
};

type AttributePanelProps = {
  graphData: GraphData;
  currentNodes: GraphNode[] | GraphLink[];
  title: string;
  filterType: 'nodeFilters' | 'edgeFilters';
  pendingFilters: Filter[];
  onAddFilter: (type: 'nodeFilters' | 'edgeFilters', filter: Partial<Filter> | null) => void;
  onRemoveFilter: (type: 'nodeFilters' | 'edgeFilters', attribute: string, queryStep?: number | null, queryContext?: string | null) => void;
  onSaveFilters: (type: 'nodeFilters' | 'edgeFilters') => void;
  allPendingFilters: PendingFilters;
  onFinalize: () => void;
  onClearAll: () => void;
  partitionByNodeType?: boolean;
  theme?: 'blue' | 'green';
};

const AttributePanel: React.FC<AttributePanelProps> = ({ 
  graphData, 
  currentNodes, 
  title, 
  filterType, 
  pendingFilters, 
  onAddFilter, 
  onRemoveFilter, 
  onSaveFilters,
  allPendingFilters,
  onFinalize,
  onClearAll,
  partitionByNodeType = false,
  theme = 'blue'
}) => {
  usePerformanceMonitor(`Rendering AttributePanel: ${title}`);
  
  const [localFilters, setLocalFilters] = useState<Map<string, Filter | null>>(new Map());

  // Helper: analyze attributes for a given dataset
  const analyzeAttributes = (dataset: (GraphNode | GraphLink)[], label: string) => {
    console.time(`Attribute Analysis: ${title} [${label}]`);
    if (!dataset || !graphData) {
      console.timeEnd(`Attribute Analysis: ${title} [${label}]`);
      return [] as any[];
    }

    type AttrAgg = { name: string; values: any[]; types: Set<string>; uniqueValues: Set<any>; nullCount: number };
    const nodeAttributes: Record<string, AttrAgg> = {};
    
    dataset.forEach((node) => {
      Object.entries(node as any).forEach(([key, value]) => {
        if (key === 'id') return;
        
        if (!nodeAttributes[key]) {
          nodeAttributes[key] = {
            name: key,
            values: [],
            types: new Set(),
            uniqueValues: new Set(),
            nullCount: 0
          };
        }
        
        if (value === null || value === undefined || value === '') {
          nodeAttributes[key].nullCount++;
        } else {
          nodeAttributes[key].values.push(value);
          nodeAttributes[key].uniqueValues.add(value);
          nodeAttributes[key].types.add(typeof value);
        }
      });
    });

    const result = Object.values(nodeAttributes).map((attr: AttrAgg) => {
      const { name, values, types, uniqueValues, nullCount } = attr;
      const total = values.length + nullCount;
      
      // Determine attribute type
      const hasNumbers = values.some((v: any) => !isNaN(v) && typeof v === 'number');
      const hasStrings = values.some((v: any) => typeof v === 'string');
      const isNumeric = hasNumbers && !hasStrings;
      const isBoolean = types.has('boolean') && types.size === 1;
      const isDate = values.some(v => 
        typeof v === 'string' && !isNaN(Date.parse(v)) && v.includes('-')
      );
      
      // Calculate basic stats
      let min, max, mean;
      if (isNumeric) {
        const numericValues = values.filter((v: any) => !isNaN(v));
        min = Math.min(...numericValues);
        max = Math.max(...numericValues);
        mean = (numericValues as number[]).reduce((a: number, b: number) => a + b, 0) / (numericValues as number[]).length;
      }
      
      const cardinality = uniqueValues.size;
      const isHighCardinality = cardinality > 20;
      
      return {
        name,
        total,
        cardinality,
        uniqueValues,
        isNumeric,
        isBoolean,
        isDate,
        isHighCardinality,
        min,
        max,
        mean,
        nullCount,
        completeness: ((total - nullCount) / total * 100).toFixed(1)
      };
    });

    console.timeEnd(`Attribute Analysis: ${title} [${label}]`);
    return result;
  };

  // Memoized attribute analysis for performance
  const attributes = useMemo<any[]>(() => {
    console.time(`Attribute Analysis: ${title}`);
    if (!currentNodes || !graphData) {
      console.timeEnd(`Attribute Analysis: ${title}`);
      return [];
    }
    const result = analyzeAttributes(currentNodes as (GraphNode | GraphLink)[], 'all');
    console.log(`Attribute analysis completed for ${title}:`, result.map(r => r.name));
    console.timeEnd(`Attribute Analysis: ${title}`);
    return result;
  }, [currentNodes, graphData, title]);

  // Precompute groups by node type for optional partition view (always call hook)
  const groupsByType = useMemo(() => {
    const map = new Map<string, GraphNode[]>();
    (currentNodes as GraphNode[]).forEach((n) => {
      const t = String((n as any)['Node Type'] || 'Unknown');
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(n);
    });
    return map;
  }, [currentNodes]);

  // Handle filter changes with OR logic for categorical filters
  const handleFilterChange = useCallback((type: 'nodeFilters' | 'edgeFilters', filter: Partial<Filter> | null) => {
    if (!filter) {
      setLocalFilters(prev => new Map(prev));
      onAddFilter(type, null);
      return;
    }

    setLocalFilters((prev) => {
      const newMap = new Map(prev);
      const existingFilter = filter ? (newMap.get(filter.attribute as string) as Filter | undefined) : undefined;
      
      if (filter.type === 'categorical' && existingFilter?.type === 'categorical') {
        // Merge categorical values with OR logic
        const mergedValues = [...new Set([...(existingFilter.values || []), ...(((filter as Filter).values) || [])])];
        const mergedFilter: Filter = { ...(filter as Filter), values: mergedValues } as Filter;
        newMap.set(filter.attribute as string, mergedFilter);
        onAddFilter(type, mergedFilter);
      } else {
        if (filter) newMap.set(filter.attribute as string, filter as Filter);
        onAddFilter(type, filter);
      }
      
      return newMap;
    });
  }, [onAddFilter]);

  if (!currentNodes || (currentNodes as any[]).length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <p className="text-gray-500 text-center">No data available</p>
      </div>
    );
  }

  // Partitioned rendering by node type (applicable when showing node attributes at root)
  if (partitionByNodeType) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 relative">
        <PendingFiltersOverlay 
          pendingFilters={allPendingFilters}
          onFinalize={onFinalize}
          onRemoveFilter={onRemoveFilter}
          onClearAll={onClearAll}
        />
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-1">{(currentNodes as any[]).length.toLocaleString()} total nodes • Partitioned by Node Type</p>
        </div>
        <div className="p-4 space-y-8">
          {Array.from(groupsByType.entries()).map(([type, nodes]) => {
            const attrs = analyzeAttributes(nodes, type);
            const handleChange = (filter: any) => {
              if (filter) {
                (filter as any).queryStep = -1;
                (filter as any).queryContext = type;
              }
              handleFilterChange('nodeFilters', filter);
            };
            return (
              <div key={type} className="border border-vercel-border rounded">
                <div className="px-3 py-2 bg-vercel-bg border-b border-vercel-border flex items-center justify-between">
                  <div className="text-xs font-mono font-medium text-vercel-black">{type}</div>
                  <div className="text-xs font-mono text-vercel-gray">{nodes.length.toLocaleString()} nodes • {attrs.length} attributes</div>
                </div>
                <div className="p-3 space-y-6">
                  {attrs.map((attribute: any) => (
                    <div key={attribute.name} className="border-b border-vercel-border pb-4 last:border-b-0">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-mono font-medium text-vercel-black">{attribute.name}</h4>
                        <div className="text-xs font-mono text-vercel-gray">{attribute.cardinality} unique</div>
                      </div>
                      {attribute.isNumeric ? (
                        <div className="space-y-3">
                          <CustomHistogram
                            data={nodes}
                            attribute={attribute}
                            onBrushChange={(f: any) => handleChange(f as Filter)}
                            currentFilter={localFilters.get(attribute.name)}
                            theme={theme === 'green' ? 'green' : 'blue'}
                          />
                        </div>
                      ) : attribute.isHighCardinality ? (
                        <div className="space-y-2">
                          <CustomSearch
                            data={nodes}
                            attribute={attribute}
                            onSelectionChange={(f: any) => handleChange(f as Filter)}
                            currentFilter={localFilters.get(attribute.name)}
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <CustomBarChart
                            data={nodes}
                            attribute={attribute}
                            onBarClick={(value: string) => {
                              const currentFilter = localFilters.get(attribute.name);
                              const currentValues = currentFilter?.values || [];
                              let newValues;
                              if ((currentValues as string[]).includes(value)) newValues = (currentValues as string[]).filter((v: string) => v !== value);
                              else newValues = [...(currentValues as string[]), value];
                              const filter = newValues.length > 0 ? ({ type: 'categorical' as const, attribute: attribute.name as string, values: newValues as string[] }) : null;
                              handleChange(filter);
                            }}
                            currentFilter={localFilters.get(attribute.name)}
                            theme={theme === 'green' ? 'green' : 'blue'}
                          />
                        </div>
                      )}
                      {localFilters.has(attribute.name) && (
                        <div className="mt-2 text-xs font-mono text-vercel-black bg-vercel-bg px-2 py-1 rounded border border-vercel-border flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          <span>Added to pending filters</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded shadow-sm border border-vercel-border relative">
      {/* Pending Filters Overlay */}
      <PendingFiltersOverlay 
        pendingFilters={allPendingFilters}
        onFinalize={onFinalize}
        onRemoveFilter={onRemoveFilter}
        onClearAll={onClearAll}
      />
      
      <div className="p-3 border-b border-vercel-border flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-mono font-semibold text-vercel-black">{title}</h3>
          <p className="text-xs font-mono text-vercel-gray mt-1">
            {currentNodes.length.toLocaleString()} items • {attributes.length} attributes
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Placeholder for Derive button; wired in App container */}
          {/* Using a data-attribute hook for parent to inject via portal or overlay if needed */}
          <div id="derive-button-slot" />
        </div>
      </div>

      <div className="p-3 space-y-4">
        {attributes.map((attribute: any) => (
          <div key={attribute.name} className="border-b border-vercel-border pb-4 last:border-b-0">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-mono font-medium text-vercel-black">
                {attribute.name}
              </h4>
              <div className="text-xs font-mono text-vercel-light-gray">
                {attribute.cardinality} unique
              </div>
            </div>

            {/* Render appropriate chart based on attribute type */}
            {attribute.isNumeric ? (
              <div className="space-y-3">
                <CustomHistogram
                  data={currentNodes}
                  attribute={attribute}
                  onBrushChange={(filter: any) => handleFilterChange(filterType, filter as Filter)}
                  currentFilter={localFilters.get(attribute.name)}
                  theme={filterType === 'edgeFilters' ? 'green' : 'blue'}
                />
              </div>
            ) : attribute.isHighCardinality ? (
              <div className="space-y-2">
                <CustomSearch
                  data={currentNodes}
                  attribute={attribute}
                  onSelectionChange={(filter: any) => handleFilterChange(filterType, filter as Filter)}
                  currentFilter={localFilters.get(attribute.name)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <CustomBarChart
                  data={currentNodes}
                  attribute={attribute}
                  onBarClick={(value: string) => {
                    const currentFilter = localFilters.get(attribute.name);
                    const currentValues = currentFilter?.values || [];
                    
                    let newValues;
                    if ((currentValues as string[]).includes(value)) {
                      newValues = (currentValues as string[]).filter((v: string) => v !== value);
                    } else {
                      newValues = [...(currentValues as string[]), value];
                    }
                    
                    const filter = newValues.length > 0 ? ({
                      type: 'categorical' as const,
                      attribute: attribute.name as string,
                      values: newValues as string[]
                    }) : null;
                    
                    handleFilterChange(filterType, filter);
                  }}
                  currentFilter={localFilters.get(attribute.name)}
                  theme={filterType === 'edgeFilters' ? 'green' : 'blue'}
                />
              </div>
            )}

            {/* Filter status indicator */}
            {localFilters.has(attribute.name) && (
              <div className="mt-2 text-xs font-mono text-vercel-black bg-vercel-bg px-2 py-1 rounded border border-vercel-border flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span>Added to pending filters</span>
              </div>
            )}
          </div>
        ))}
        
        {attributes.length === 0 && (
          <div className="text-center text-xs font-mono text-vercel-light-gray py-8">
            No attributes to display
          </div>
        )}
        
        {/* Derive New Attribute Button */}
        <div className="pt-4 mt-4 border-t border-vercel-border">
          <div id="derive-button-container" />
        </div>
      </div>
    </div>
  );
};

export default AttributePanel; 
