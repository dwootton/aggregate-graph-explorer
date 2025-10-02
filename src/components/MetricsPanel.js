import React, { useState, useEffect } from 'react';

const MetricsPanel = ({ graphData, selectedNodeType, filteredNodes, onFilterChange }) => {
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [customAttributes, setCustomAttributes] = useState([]);
  const [newAttributeName, setNewAttributeName] = useState('');
  const [newAttributeFormula, setNewAttributeFormula] = useState('');

  // Get relevant nodes based on current selection
  const getRelevantNodes = () => {
    if (!graphData || !graphData.nodes) return [];
    
    if (selectedNodeType) {
      return graphData.nodes.filter(node => node['Node Type'] === selectedNodeType);
    }
    
    return filteredNodes.length > 0 ? filteredNodes : graphData.nodes;
  };

  // Get unique attributes for the current node set
  const getAttributes = () => {
    const nodes = getRelevantNodes();
    if (nodes.length === 0) return [];

    const attributeMap = new Map();
    
    nodes.forEach(node => {
      Object.entries(node).forEach(([key, value]) => {
        if (key !== 'id' && value !== null && value !== undefined) {
          if (!attributeMap.has(key)) {
            attributeMap.set(key, {
              name: key,
              type: typeof value,
              values: new Set(),
              min: null,
              max: null
            });
          }
          
          const attr = attributeMap.get(key);
          attr.values.add(value);
          
          if (typeof value === 'number') {
            attr.min = attr.min === null ? value : Math.min(attr.min, value);
            attr.max = attr.max === null ? value : Math.max(attr.max, value);
          }
        }
      });
    });

    return Array.from(attributeMap.values());
  };

  // Apply filters to nodes
  useEffect(() => {
    const nodes = getRelevantNodes();
    let filtered = nodes;

    // Apply search term
    if (searchTerm) {
      filtered = filtered.filter(node => 
        Object.values(node).some(value => 
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply attribute filters
    Object.entries(filters).forEach(([attributeName, filterValue]) => {
      if (filterValue !== null && filterValue !== undefined && filterValue !== '') {
        if (typeof filterValue === 'object' && filterValue.min !== undefined) {
          // Range filter
          filtered = filtered.filter(node => {
            const value = node[attributeName];
            return value >= filterValue.min && value <= filterValue.max;
          });
        } else {
          // Exact match or string contains
          filtered = filtered.filter(node => {
            const value = node[attributeName];
            if (typeof value === 'string' && typeof filterValue === 'string') {
              return value.toLowerCase().includes(filterValue.toLowerCase());
            }
            return value === filterValue;
          });
        }
      }
    });

    onFilterChange(filtered);
  }, [filters, searchTerm, selectedNodeType, graphData]);

  const handleFilterChange = (attributeName, value) => {
    setFilters(prev => ({
      ...prev,
      [attributeName]: value
    }));
  };

  const addCustomAttribute = () => {
    if (!newAttributeName || !newAttributeFormula) return;

    const newAttribute = {
      name: newAttributeName,
      formula: newAttributeFormula,
      id: Date.now()
    };

    setCustomAttributes(prev => [...prev, newAttribute]);
    setNewAttributeName('');
    setNewAttributeFormula('');
  };

  const calculateCustomAttribute = (node, formula) => {
    try {
      // Simple formula evaluation - in production would use a proper expression parser
      if (formula.includes('count(')) {
        const edgeType = formula.match(/count\((.*?)\)/)?.[1];
        const nodeConnections = graphData.links.filter(link => 
          (link.source === node.id || link.target === node.id) &&
          (!edgeType || link['Edge Type'] === edgeType)
        );
        return nodeConnections.length;
      }
      return 0;
    } catch {
      return 0;
    }
  };

  const attributes = getAttributes();
  const relevantNodes = getRelevantNodes();

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Metrics & Filters</h3>
      
      {/* Search */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Search
        </label>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search nodes..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Node count */}
      <div className="mb-4 p-3 bg-gray-50 rounded">
        <div className="text-sm font-medium text-gray-700">
          {relevantNodes.length} nodes
          {selectedNodeType && ` (${selectedNodeType})`}
        </div>
      </div>

      {/* Attribute Filters */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {attributes.map(attr => (
          <div key={attr.name} className="border-b border-gray-200 pb-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {attr.name}
            </label>
            
            {attr.type === 'number' && attr.min !== null && attr.max !== null ? (
              // Range slider for numeric attributes
              <div className="space-y-2">
                <input
                  type="range"
                  min={attr.min}
                  max={attr.max}
                  value={filters[attr.name]?.min || attr.min}
                  onChange={(e) => handleFilterChange(attr.name, {
                    min: parseInt(e.target.value),
                    max: filters[attr.name]?.max || attr.max
                  })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{attr.min}</span>
                  <span>{attr.max}</span>
                </div>
              </div>
            ) : attr.type === 'boolean' ? (
              // Checkbox for boolean attributes
              <select
                value={filters[attr.name] || ''}
                onChange={(e) => handleFilterChange(attr.name, 
                  e.target.value === '' ? null : e.target.value === 'true'
                )}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">All</option>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            ) : (
              // Text input for string attributes
              <input
                type="text"
                value={filters[attr.name] || ''}
                onChange={(e) => handleFilterChange(attr.name, e.target.value)}
                placeholder={`Filter by ${attr.name}...`}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            )}
            
            {/* Show unique values for categorical attributes */}
            {attr.type === 'string' && attr.values.size <= 10 && (
              <div className="mt-2 space-y-1">
                {Array.from(attr.values).slice(0, 5).map(value => (
                  <button
                    key={value}
                    onClick={() => handleFilterChange(attr.name, value)}
                    className="block text-xs text-blue-600 hover:text-blue-800"
                  >
                    {String(value)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Custom Attributes */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Custom Attributes</h4>
        
        {/* Add new custom attribute */}
        <div className="space-y-2 mb-4">
          <input
            type="text"
            value={newAttributeName}
            onChange={(e) => setNewAttributeName(e.target.value)}
            placeholder="Attribute name..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <input
            type="text"
            value={newAttributeFormula}
            onChange={(e) => setNewAttributeFormula(e.target.value)}
            placeholder="Formula (e.g., count(PerformerOf))"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <button
            onClick={addCustomAttribute}
            className="w-full px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
          >
            Add Attribute
          </button>
        </div>

        {/* List custom attributes */}
        {customAttributes.map(attr => (
          <div key={attr.id} className="p-2 bg-gray-50 rounded mb-2">
            <div className="text-sm font-medium">{attr.name}</div>
            <div className="text-xs text-gray-600">{attr.formula}</div>
            <button
              onClick={() => setCustomAttributes(prev => prev.filter(a => a.id !== attr.id))}
              className="text-xs text-red-600 hover:text-red-800 mt-1"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MetricsPanel; 