import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';

// Custom Histogram Component
export const CustomHistogram = ({ 
  data, 
  attribute, 
  onBrushChange, 
  currentFilter,
  theme = 'blue',
  width = 280,
  height = 120,
  marginTop = 10,
  marginRight = 20,
  marginBottom = 30,
  marginLeft = 40
}) => {
  const svgRef = useRef();
  const brushRef = useRef();
  const [brushSelection, setBrushSelection] = useState(null);
  
  const innerWidth = width - marginLeft - marginRight;
  const innerHeight = height - marginTop - marginBottom;
  
  // Create scales and bins
  const { xScale, yScale, bins } = useMemo(() => {
    const values = data.map(d => d[attribute.name]).filter(v => v != null && !isNaN(v));
    
    const xScale = d3.scaleLinear()
      .domain(d3.extent(values))
      .range([0, innerWidth]);
    
    const bins = d3.bin()
      .domain(xScale.domain())
      .thresholds(Math.min(30, Math.sqrt(values.length)))
      (values);
    
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(bins, d => d.length)])
      .range([innerHeight, 0]);
    
    return { xScale, yScale, bins };
  }, [data, attribute.name, innerWidth, innerHeight]);
  
  // Set up brush
  useEffect(() => {
    if (!svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    const brushGroup = svg.select('.brush-group');
    
    const brush = d3.brushX()
      .extent([[0, 0], [innerWidth, innerHeight]])
      .on('brush end', (event) => {
        if (!event.sourceEvent) return;
        const selection = event.selection;
        setBrushSelection(selection);
        
        if (selection && onBrushChange) {
          const [x0, x1] = selection.map(xScale.invert);
          onBrushChange({
            type: 'range',
            attribute: attribute.name,
            min: Math.min(x0, x1),
            max: Math.max(x0, x1)
          });
        } else if (!selection && onBrushChange) {
          onBrushChange(null);
        }
      });
    
    brushGroup.call(brush);
    brushRef.current = brush;
    
    // Set initial brush if filter exists
    if (currentFilter && currentFilter.type === 'range') {
      const selection = [currentFilter.min, currentFilter.max].map(xScale);
      brushGroup.call(brush.move, selection);
    }
  }, [xScale, innerWidth, innerHeight, onBrushChange, attribute.name, currentFilter]);
  
  return (
    <div className="relative">
      <svg ref={svgRef} width={width} height={height} className="border border-gray-200 rounded">
        <g transform={`translate(${marginLeft},${marginTop})`}>
          {/* Bars */}
          {bins.map((bin, i) => (
            <rect
              key={i}
              x={xScale(bin.x0)}
              y={yScale(bin.length)}
              width={Math.max(0, xScale(bin.x1) - xScale(bin.x0) - 1)}
              height={innerHeight - yScale(bin.length)}
              fill={theme === 'green' ? '#10B981' : '#3B82F6'}
              fillOpacity={0.7}
              stroke={theme === 'green' ? '#059669' : '#2563EB'}
              strokeWidth={0.5}
            />
          ))}
          
          {/* X Axis */}
          <g transform={`translate(0,${innerHeight})`}>
            {xScale.ticks(5).map(tick => (
              <g key={tick} transform={`translate(${xScale(tick)},0)`}>
                <line y2="6" stroke="currentColor" />
                <text
                  y="20"
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                >
                  {d3.format('.2s')(tick)}
                </text>
              </g>
            ))}
          </g>
          
          {/* Y Axis */}
          <g>
            {yScale.ticks(3).map(tick => (
              <g key={tick} transform={`translate(0,${yScale(tick)})`}>
                <line x2="-6" stroke="currentColor" />
                <text
                  x="-10"
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="10"
                  fill="currentColor"
                >
                  {tick}
                </text>
              </g>
            ))}
          </g>
          
          {/* Brush */}
          <g className="brush-group"></g>
        </g>
      </svg>
      
      {/* Clear brush button */}
      {brushSelection && (
        <button
          onClick={() => {
            const svg = d3.select(svgRef.current);
            svg.select('.brush-group').call(brushRef.current.clear);
            setBrushSelection(null);
            if (onBrushChange) onBrushChange(null);
          }}
          className="absolute top-2 right-2 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
};

// Custom Bar Chart Component
export const CustomBarChart = ({ 
  data, 
  attribute, 
  onBarClick,
  currentFilter,
  theme = 'blue',
  width = 280,
  height = 120,
  marginTop = 10,
  marginRight = 20,
  marginBottom = 30,
  marginLeft = 40
}) => {
  const innerWidth = width - marginLeft - marginRight;
  const innerHeight = height - marginTop - marginBottom;
  
  // Calculate bar data
  const { xScale, yScale, barData } = useMemo(() => {
    const valueCounts = {};
    data.forEach(d => {
      const value = d[attribute.name];
      if (value != null) {
        valueCounts[value] = (valueCounts[value] || 0) + 1;
      }
    });
    
    const entries = Object.entries(valueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15); // Show top 15 categories
    
    const xScale = d3.scaleBand()
      .domain(entries.map(d => d[0]))
      .range([0, innerWidth])
      .padding(0.1);
    
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(entries, d => d[1])])
      .range([innerHeight, 0]);
    
    return { xScale, yScale, barData: entries };
  }, [data, attribute.name, innerWidth, innerHeight]);
  
  const selectedValues = currentFilter?.values || [];
  
  return (
    <div className="relative">
      <svg width={width} height={height} className="border border-gray-200 rounded">
        <g transform={`translate(${marginLeft},${marginTop})`}>
          {/* Bars */}
          {barData.map(([value, count]) => {
            const isSelected = selectedValues.includes(value);
            const base = theme === 'green' ? '#10B981' : '#3B82F6';
            const baseStroke = theme === 'green' ? '#059669' : '#2563EB';
            const fillColor = isSelected ? base : base;
            const strokeColor = isSelected ? baseStroke : baseStroke;
            return (
              <rect
                key={value}
                x={xScale(value)}
                y={yScale(count)}
                width={xScale.bandwidth()}
                height={innerHeight - yScale(count)}
                fill={fillColor}
                fillOpacity={0.8}
                stroke={strokeColor}
                strokeWidth={1}
                className="cursor-pointer transition-all duration-200 hover:opacity-100"
                onClick={() => onBarClick && onBarClick(value)}
                onDoubleClick={(e) => e.stopPropagation()}
              />
            );
          })}
          
          {/* X Axis */}
          <g transform={`translate(0,${innerHeight})`}>
            {barData.map(([value]) => (
              <g key={value} transform={`translate(${xScale(value) + xScale.bandwidth()/2},0)`}>
                <line y2="6" stroke="currentColor" />
                <text
                  y="20"
                  textAnchor="middle"
                  fontSize="9"
                  fill="currentColor"
                  transform={barData.length > 8 ? "rotate(-45)" : ""}
                >
                  {String(value).length > 8 ? String(value).slice(0, 8) + '...' : value}
                </text>
              </g>
            ))}
          </g>
          
          {/* Y Axis */}
          <g>
            {yScale.ticks(3).map(tick => (
              <g key={tick} transform={`translate(0,${yScale(tick)})`}>
                <line x2="-6" stroke="currentColor" />
                <text
                  x="-10"
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="10"
                  fill="currentColor"
                >
                  {tick}
                </text>
              </g>
            ))}
          </g>
        </g>
      </svg>
      
      {/* Selection info */}
      {selectedValues.length > 0 && (
        <div className="absolute top-2 right-2 px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
          {selectedValues.length} selected
        </div>
      )}
    </div>
  );
};

// Custom Search Component
export const CustomSearch = ({ 
  data, 
  attribute, 
  onSelectionChange,
  currentFilter
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedValues, setSelectedValues] = useState(new Set(currentFilter?.values || []));
  
  // Get unique values and their counts
  const { uniqueValues, filteredValues } = useMemo(() => {
    const valueCounts = {};
    data.forEach(d => {
      const value = d[attribute.name];
      if (value != null && value !== '') {
        valueCounts[value] = (valueCounts[value] || 0) + 1;
      }
    });
    
    const uniqueValues = Object.entries(valueCounts)
      .sort((a, b) => b[1] - a[1]);
    
    const filteredValues = uniqueValues.filter(([value]) =>
      value.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 50); // Limit to 50 results
    
    return { uniqueValues, filteredValues };
  }, [data, attribute.name, searchTerm]);
  
  const handleValueToggle = useCallback((value) => {
    setSelectedValues(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(value)) {
        newSelected.delete(value);
      } else {
        newSelected.add(value);
      }
      
      // Use setTimeout to ensure state update is processed before callback
      setTimeout(() => {
        if (onSelectionChange) {
          onSelectionChange(newSelected.size > 0 ? {
            type: 'categorical',
            attribute: attribute.name,
            values: Array.from(newSelected)
          } : null);
        }
      }, 0);
      
      return newSelected;
    });
  }, [onSelectionChange, attribute.name]);
  
  const clearAll = () => {
    setSelectedValues(new Set());
    if (onSelectionChange) onSelectionChange(null);
  };
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-left border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">
            {selectedValues.size > 0 
              ? `${selectedValues.size} selected` 
              : `Search ${attribute.name}...`}
          </span>
          <svg 
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-64 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-200">
            <input
              type="text"
              placeholder="Search values..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          
          {/* Clear all button */}
          {selectedValues.size > 0 && (
            <div className="p-2 border-b border-gray-200">
              <button
                onClick={clearAll}
                className="text-xs text-red-600 hover:text-red-800 transition-colors"
              >
                Clear all ({selectedValues.size})
              </button>
            </div>
          )}
          
          {/* Options list */}
          <div className="max-h-40 overflow-y-auto">
            {filteredValues.map(([value, count]) => (
              <label
                key={value}
                className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                onDoubleClick={(e) => e.preventDefault()} // Prevent double-click issues
              >
                <input
                  type="checkbox"
                  checked={selectedValues.has(value)}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleValueToggle(value);
                  }}
                  onDoubleClick={(e) => e.stopPropagation()} // Prevent double-click propagation
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="flex-1 text-sm truncate">{value}</span>
                <span className="text-xs text-gray-500 ml-2">({count})</span>
              </label>
            ))}
          </div>
          
          {filteredValues.length === 0 && searchTerm && (
            <div className="p-3 text-sm text-gray-500 text-center">
              No matching values found
            </div>
          )}
        </div>
      )}
    </div>
  );
}; 
