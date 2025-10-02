import React, { useState, useMemo, useCallback } from 'react';
import { CustomHistogram, CustomBarChart, CustomSearch } from './CustomCharts';
import { GraphData, GraphNode, GraphLink, Filter, PendingFilters } from '../types';

// Pending Filters Overlay Component
type OverlayProps = {
  pendingFilters: PendingFilters;
  onFinalize: () => void;
  onRemoveFilter: (type: 'nodeFilters' | 'edgeFilters', attribute: string, queryStep?: number | null) => void;
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
    <div className="absolute inset-x-0 top-0 z-10 bg-yellow-50 border-l-4 border-yellow-400 p-3 m-4 rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <h3 className="text-sm font-medium text-yellow-800">
            ⏳ Adding to Query ({totalPending} pending filters)
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onFinalize}
            className="px-3 py-1 bg-yellow-600 text-white text-sm rounded-md hover:bg-yellow-700 transition-colors inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Finalize Filters
          </button>
          <button
            onClick={onClearAll}
            className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-400 transition-colors inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            Clear All
          </button>
        </div>
      </div>
      
      <div className="space-y-2">
        {pendingFilters.nodeFilters.length > 0 && (
          <div>
            <span className="text-xs font-medium text-green-700 block mb-1">Node Filters:</span>
            <div className="flex flex-wrap gap-2">
              {pendingFilters.nodeFilters.map((filter: Filter, index: number) => (
                <div key={index} className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs rounded border border-green-200">
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                  <span>{getFilterDisplayText(filter)}</span>
                  <button
                    onClick={() => onRemoveFilter('nodeFilters', filter.attribute, filter.queryStep)}
                    className="ml-1 text-red-500 hover:text-red-700"
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
            <span className="text-xs font-medium text-blue-700 block mb-1">Edge Filters:</span>
            <div className="flex flex-wrap gap-2">
              {pendingFilters.edgeFilters.map((filter: Filter, index: number) => (
                <div key={index} className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded border border-blue-200">
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                  <span>{getFilterDisplayText(filter)}</span>
                  <button
                    onClick={() => onRemoveFilter('edgeFilters', filter.attribute, filter.queryStep)}
                    className="ml-1 text-red-500 hover:text-red-700"
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
  onRemoveFilter: (type: 'nodeFilters' | 'edgeFilters', attribute: string, queryStep?: number | null) => void;
  onSaveFilters: (type: 'nodeFilters' | 'edgeFilters') => void;
  allPendingFilters: PendingFilters;
  onFinalize: () => void;
  onClearAll: () => void;
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
  onClearAll
}) => {
  usePerformanceMonitor(`Rendering AttributePanel: ${title}`);
  
  const [localFilters, setLocalFilters] = useState<Map<string, Filter | null>>(new Map());

  // Memoized attribute analysis for performance
  const attributes = useMemo<any[]>(() => {
    console.time(`Attribute Analysis: ${title}`);
    if (!currentNodes || !graphData) {
      console.timeEnd(`Attribute Analysis: ${title}`);
      return [];
    }

    type AttrAgg = { name: string; values: any[]; types: Set<string>; uniqueValues: Set<any>; nullCount: number };
    const nodeAttributes: Record<string, AttrAgg> = {};
    
    (currentNodes as (GraphNode | GraphLink)[]).forEach((node) => {
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

    console.log(`Attribute analysis completed for ${title}:`, result.map(r => r.name));
    console.timeEnd(`Attribute Analysis: ${title}`);
    return result;
  }, [currentNodes, graphData, title]);

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

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 relative">
      {/* Pending Filters Overlay */}
      <PendingFiltersOverlay 
        pendingFilters={allPendingFilters}
        onFinalize={onFinalize}
        onRemoveFilter={onRemoveFilter}
        onClearAll={onClearAll}
      />
      
      <div className="p-4 border-b border-gray-200 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {currentNodes.length.toLocaleString()} items • {attributes.length} attributes
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Placeholder for Derive button; wired in App container */}
          {/* Using a data-attribute hook for parent to inject via portal or overlay if needed */}
          <div id="derive-button-slot" />
        </div>
      </div>

      <div className="p-4 space-y-6">
        {attributes.map((attribute: any) => (
          <div key={attribute.name} className="border-b border-gray-100 pb-4 last:border-b-0">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900">
                {attribute.name}
              </h4>
              <div className="text-xs text-gray-500">
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
                />
                <div className="text-xs text-gray-600">
                  Range: {attribute.min?.toLocaleString()} - {attribute.max?.toLocaleString()}
                  {attribute.mean && ` • Avg: ${attribute.mean.toFixed(2)}`}
                </div>
              </div>
            ) : attribute.isHighCardinality ? (
              <div className="space-y-2">
                <CustomSearch
                  data={currentNodes}
                  attribute={attribute}
                  onSelectionChange={(filter: any) => handleFilterChange(filterType, filter as Filter)}
                  currentFilter={localFilters.get(attribute.name)}
                />
                <div className="text-xs text-gray-600">
                  {attribute.cardinality} unique values • {attribute.completeness}% complete
                </div>
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
                />
                <div className="text-xs text-gray-600">
                  Click bars to filter • {attribute.completeness}% complete
                </div>
              </div>
            )}

            {/* Filter status indicator */}
            {localFilters.has(attribute.name) && (
              <div className="mt-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span>Added to pending filters</span>
              </div>
            )}
          </div>
        ))}
        
        {attributes.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No attributes to display
          </div>
        )}
      </div>
    </div>
  );
};

export default AttributePanel; 
