import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

// Function to calculate luminance and determine text color for contrast
const calculateTextColor = (backgroundColor) => {
  // Convert hex to RGB
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;
  
  // Calculate relative luminance
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  
  // Return white text for dark backgrounds, dark text for light backgrounds
  return luminance > 0.5 ? '#1F2937' : '#FFFFFF';
};

const TreemapView = ({
  graphData,
  currentView,
  selectedNodeType,
  selectedEdgeType,
  nodeTypeSummary,
  edgeTypeSummary,
  filteredNodes,
  onNodeTypeClick,
  onEdgeTypeClick,
  onBackClick,
  settings, // Add settings prop for colors
  isCalculating, // Add loading state
  calculationProgress // Add progress message
}) => {
  const svgRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, content: '', title: '' });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(600, rect.width - 40),
          height: Math.max(400, Math.min(600, rect.height - 100))
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Smart connector routing function
  const createSmartPath = (startX, startY, endX, endY, rectangles, corridorY) => {
    // Simple smart routing that avoids rectangles
    const path = d3.path();
    path.moveTo(startX, startY);
    
    // Go down to corridor level
    path.lineTo(startX, corridorY);
    
    // Find the best horizontal path through the corridor
    const horizontalPath = findHorizontalPath(startX, endX, corridorY, rectangles);
    
    // Draw the horizontal segments
    horizontalPath.forEach((point, index) => {
      if (index === 0) return; // Skip first point (already at startX, corridorY)
      path.lineTo(point.x, point.y);
    });
    
    // Go down to target
    path.lineTo(endX, endY);
    
    return path.toString();
  };

  const findHorizontalPath = (startX, endX, y, rectangles) => {
    // Create a simple path that goes around rectangles
    const points = [{ x: startX, y }];
    
    // Check if direct path is clear
    const directPathClear = !rectangles.some(rect => 
      y >= rect.y0 - 10 && y <= rect.y1 + 10 && 
      ((startX <= rect.x1 + 10 && startX >= rect.x0 - 10) || 
       (endX <= rect.x1 + 10 && endX >= rect.x0 - 10) ||
       (startX < rect.x0 && endX > rect.x1))
    );
    
    if (directPathClear) {
      points.push({ x: endX, y });
      return points;
    }
    
    // Find path around obstacles
    const sortedRects = rectangles
      .filter(rect => y >= rect.y0 - 10 && y <= rect.y1 + 10)
      .sort((a, b) => a.x0 - b.x0);
    
    let currentX = startX;
    const targetX = endX;
    
    for (const rect of sortedRects) {
      if ((currentX < rect.x0 && targetX > rect.x0) || 
          (currentX > rect.x1 && targetX < rect.x1)) {
        // Need to go around this rectangle
        if (currentX < targetX) {
          // Going right, go around the right side
          points.push({ x: rect.x1 + 15, y });
          currentX = rect.x1 + 15;
        } else {
          // Going left, go around the left side
          points.push({ x: rect.x0 - 15, y });
          currentX = rect.x0 - 15;
        }
      }
    }
    
    points.push({ x: endX, y });
    return points;
  };

  useEffect(() => {
    if (!svgRef.current) return;

    console.time('Treemap Rendering');
    console.log(`Starting treemap render for view: ${currentView}`, {
      dimensions,
      dataSource: currentView === 'nodeTypes' ? 'nodeTypeSummary' : 
                  currentView === 'edgeTypes' ? 'edgeTypeSummary' : 'filteredNodes',
      dataSize: currentView === 'nodeTypes' ? nodeTypeSummary.length :
                currentView === 'edgeTypes' ? edgeTypeSummary.length : filteredNodes.length
    });

    console.time('SVG Setup');
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = dimensions;
    const margin = { top: 80, right: 10, bottom: 10, left: 10 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Reserve more space for connector corridor
    const connectorCorridor = 60;
    const treemapHeight = innerHeight - connectorCorridor;

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    console.timeEnd('SVG Setup');

    console.time('Data Preparation');
    let data = [];
    let colorScale;
    let parentNode = null;

    // Use settings colors if available
    // Defaults: nodes blue, edges green shades
    const defaultNodeColor = settings?.nodeColor || '#3B82F6'; // Blue
    const defaultEdgeColor = settings?.edgeColor || '#22C55E'; // Green
    const greenShades = settings?.edgeTypeColors || [
      '#E3F9E5', '#C1F2C7', '#A7EFC5', '#86EFAC', '#4ADE80', '#22C55E', '#16A34A', '#15803D', '#166534'
    ];

    if (currentView === 'nodeTypes') {
      data = nodeTypeSummary.map(item => ({
        ...item,
        value: item.count,
        id: item.type,
        label: item.type
      }));
      // All node type rectangles in blue
      colorScale = () => defaultNodeColor;
    } else if (currentView === 'edgeTypes') {
      data = edgeTypeSummary.map(item => ({
        ...item,
        value: item.count,
        id: item.type,
        label: item.type
      }));
      // Edge type rectangles in varying green shades
      colorScale = d3.scaleOrdinal(greenShades);
      
      // Add parent node representation
      parentNode = {
        label: selectedNodeType,
        x: innerWidth / 2 - 80,
        y: -60,
        width: 160,
        height: 35
      };
    } else if (currentView === 'specificNodes') {
      console.time('Node Grouping');
      // Group nodes by type for treemap
      const nodesByType = {};
      filteredNodes.forEach(node => {
        const nodeType = node['Node Type'] || 'Unknown';
        if (!nodesByType[nodeType]) {
          nodesByType[nodeType] = [];
        }
        nodesByType[nodeType].push(node);
      });

      data = Object.entries(nodesByType).map(([nodeType, nodes]) => ({
        id: nodeType,
        label: nodeType,
        value: nodes.length,
        nodes: nodes,
        type: 'nodeType'
      }));
      // Specific nodes are still node groups: keep blue
      colorScale = () => defaultNodeColor;
      console.timeEnd('Node Grouping');
      
      // Add parent edge representation
      parentNode = {
        label: `${selectedNodeType} → ${selectedEdgeType}`,
        x: innerWidth / 2 - 140,
        y: -60,
        width: 280,
        height: 35
      };
    }

    if (data.length === 0) {
      console.log('No data to render');
      console.timeEnd('Treemap Rendering');
      return;
    }

    console.log(`Data prepared: ${data.length} items`, {
      totalValue: data.reduce((sum, d) => sum + d.value, 0),
      largest: data.sort((a, b) => b.value - a.value)[0]?.label
    });
    console.timeEnd('Data Preparation');

    console.time('D3 Hierarchy & Treemap');
    // Create hierarchy
    const root = d3.hierarchy({ children: data })
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value);

    // Create treemap layout with increased padding for smart routing
    const treemap = d3.treemap()
      .size([innerWidth, treemapHeight])
      .padding(12) // Increased padding for routing space
      .round(true);

    treemap(root);

    // Offset treemap rectangles to leave corridor space
    const yOffset = connectorCorridor;
    root.leaves().forEach(d => {
      d.y0 += yOffset;
      d.y1 += yOffset;
    });
    console.timeEnd('D3 Hierarchy & Treemap');

    // Collect rectangle positions for smart routing
    const rectangles = root.leaves().map(d => ({
      x0: d.x0,
      y0: d.y0,
      x1: d.x1,
      y1: d.y1
    }));

    console.time('Parent Node Rendering');
    // Draw parent node if it exists
    if (parentNode && (!settings || settings.showConnectors !== false)) {
      const parentRect = g.append('rect')
        .attr('x', parentNode.x)
        .attr('y', parentNode.y)
        .attr('width', parentNode.width)
        .attr('height', parentNode.height)
        // Parent represents a node in edgeTypes view (blue) and an edge context in specificNodes view (green)
        .attr('fill', currentView === 'specificNodes' ? defaultEdgeColor : defaultNodeColor)
        .attr('stroke', d3.color(currentView === 'specificNodes' ? defaultEdgeColor : defaultNodeColor).darker(0.5))
        .attr('stroke-width', 2)
        .attr('rx', 8)
        .style('cursor', 'pointer')
        .style('filter', 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))')
        .on('click', () => {
          if (onBackClick) onBackClick();
        });

      const parentText = g.append('text')
        .attr('x', parentNode.x + parentNode.width / 2)
        .attr('y', parentNode.y + parentNode.height / 2 + 5)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text(parentNode.label)
        .style('cursor', 'pointer')
        .on('click', () => {
          if (onBackClick) onBackClick();
        });

      console.time('Smart Connector Lines');
      // Add smart connectors from parent to children
      const parentCenterX = parentNode.x + parentNode.width / 2;
      const parentBottomY = parentNode.y + parentNode.height;
      const connectorY = parentBottomY + 30; // Corridor level with more space

      root.leaves().forEach(d => {
        const childCenterX = d.x0 + (d.x1 - d.x0) / 2;
        const childTopY = d.y0;

        // Create smart connector path that avoids rectangles
        const pathData = createSmartPath(
          parentCenterX, 
          parentBottomY, 
          childCenterX, 
          childTopY, 
          rectangles, 
          connectorY
        );

        g.append('path')
          .attr('d', pathData)
          .attr('stroke', defaultEdgeColor)
          .attr('stroke-width', 2.5)
          .attr('fill', 'none')
          .style('opacity', 0.8)
          .attr('stroke-dasharray', settings?.animateTransitions ? '5,5' : 'none');

        // Add connector dots
        // Parent connection dot
        g.append('circle')
          .attr('cx', parentCenterX)
          .attr('cy', parentBottomY)
          .attr('r', 4)
          .attr('fill', defaultEdgeColor)
          .attr('stroke', 'white')
          .attr('stroke-width', 2);

        // Child connection dot
        g.append('circle')
          .attr('cx', childCenterX)
          .attr('cy', childTopY)
          .attr('r', 4)
          .attr('fill', defaultEdgeColor)
          .attr('stroke', 'white')
          .attr('stroke-width', 2);
      });

      // Main junction dot at parent
      g.append('circle')
        .attr('cx', parentCenterX)
        .attr('cy', connectorY)
        .attr('r', 5)
        .attr('fill', defaultEdgeColor)
        .attr('stroke', 'white')
        .attr('stroke-width', 2);
      console.timeEnd('Smart Connector Lines');
    }
    console.timeEnd('Parent Node Rendering');

    console.time('Treemap Rectangles');
    // Create treemap rectangles
    const cell = g.selectAll('.cell')
      .data(root.leaves())
      .enter().append('g')
      .attr('class', 'cell')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    // Add rectangles
    cell.append('rect')
      .attr('width', d => d.x1 - d.x0)
      .attr('height', d => d.y1 - d.y0)
      .attr('fill', d => colorScale(d.data.id))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('rx', 8) // Increased border radius
      .style('cursor', 'pointer')
      .style('opacity', 0.9)
      .style('filter', 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.12))')
      .style('transition', settings?.animateTransitions ? 'all 0.3s ease' : 'none')
      .on('mouseover', function(event, d) {
        d3.select(this)
          .style('opacity', 1)
          .style('filter', 'drop-shadow(0 6px 12px rgba(0, 0, 0, 0.18))');
        
        // Always show tooltip with full information
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        // Position tooltip centered above the rect
        const svgRect = svgRef.current?.getBoundingClientRect();
        const centerX = (svgRect?.left || 0) + margin.left + d.x0 + width / 2;
        const topY = (svgRect?.top || 0) + margin.top + d.y0; // top edge of rect
        
        // Create detailed tooltip content
        let content = `${d.data.value.toLocaleString()} ${currentView === 'nodeTypes' ? 'nodes' : currentView === 'edgeTypes' ? 'connections' : 'nodes'}`;
        
        // Add examples if available
        if (d.data.examples && d.data.examples.length > 0) {
          const exampleText = d.data.examples.slice(0, 3).map(ex => 
            typeof ex === 'string' ? ex : (ex.name || `Node ${ex.id}`)
          ).join(', ');
          content += `\nExamples: ${exampleText}${d.data.examples.length > 3 ? '...' : ''}`;
        }
        
        // Add connected types if available
        if (d.data.connectedNodeTypes && d.data.connectedNodeTypes.length > 0) {
          content += `\nConnects to: ${d.data.connectedNodeTypes.slice(0, 3).join(', ')}${d.data.connectedNodeTypes.length > 3 ? '...' : ''}`;
        }
        
        setTooltip({
          show: true,
          x: centerX,
          y: topY - 8, // small gap above rect
          title: d.data.label,
          content: content
        });
      })
      .on('mouseout', function(event, d) {
        d3.select(this)
          .style('opacity', 0.9)
          .style('filter', 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.12))');
        setTooltip({ show: false, x: 0, y: 0, content: '', title: '' });
      })
      .on('click', function(event, d) {
        console.log(`Treemap item clicked: ${d.data.label} (${d.data.value})`);
        if (currentView === 'nodeTypes') {
          onNodeTypeClick(d.data.id);
        } else if (currentView === 'edgeTypes') {
          onEdgeTypeClick(d.data.id);
        } else if (currentView === 'specificNodes' && d.data.type === 'nodeType') {
          // For recursive navigation - clicking a node type shows its edges
          onNodeTypeClick(d.data.id);
        }
      });
    console.timeEnd('Treemap Rectangles');

    console.time('Text Rendering');
    // Add labels with conditional rendering based on size
    cell.append('text')
      .attr('x', 12) // Increased padding
      .attr('y', 24)
      .attr('font-family', 'Arial, sans-serif')
      .attr('font-size', d => {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        return Math.min(Math.max(11, Math.min(width / 6, height / 3.5)), 20);
      })
      .attr('font-weight', 'bold')
      .attr('fill', d => calculateTextColor(colorScale(d.data.id)))
      .each(function(d) {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        
        if (width > 100 && height > 60) {
          // Show full text for larger rectangles
          d3.select(this).text(d.data.label).call(wrapText);
        } else if (width > 60 && height > 40) {
          // Show abbreviated text for medium rectangles
          const maxChars = Math.floor(width / 10);
          const text = d.data.label.length > maxChars 
            ? d.data.label.substring(0, maxChars - 2) + '..' 
            : d.data.label;
          d3.select(this).text(text);
        }
        // For very small rectangles, show no text (tooltip will handle it)
      });

    // Add count labels
    cell.append('text')
      .attr('x', 12)
      .attr('y', d => {
        const fontSize = Math.min(Math.max(11, Math.min((d.x1 - d.x0) / 6, (d.y1 - d.y0) / 3.5)), 20);
        return 24 + fontSize + 8;
      })
      .attr('font-family', 'Arial, sans-serif')
      .attr('font-size', d => {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        return Math.min(Math.max(10, Math.min(width / 8, height / 5)), 16);
      })
      .attr('fill', d => {
        const baseColor = calculateTextColor(colorScale(d.data.id));
        // Make count text slightly more subtle than main text
        return baseColor === '#FFFFFF' ? '#E5E7EB' : '#6B7280';
      })
      .each(function(d) {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        
        if (width > 80 && height > 70) {
          const text = currentView === 'specificNodes' 
            ? `${d.data.value} nodes`
            : `${d.data.value} ${currentView === 'nodeTypes' ? 'nodes' : 'connections'}`;
          d3.select(this).text(text);
        }
      });

    // Add examples or connected types (for larger rectangles only)
    cell.each(function(d) {
      const width = d.x1 - d.x0;
      const height = d.y1 - d.y0;
      
      if (width > 160 && height > 120) {
        const examples = d.data.examples || d.data.connectedNodeTypes || [];
        const maxExamples = Math.min(3, Math.floor((height - 80) / 16));
        
        d3.select(this).selectAll('.example')
          .data(examples.slice(0, maxExamples))
          .enter().append('text')
          .attr('class', 'example')
          .attr('x', 12)
          .attr('y', (_, i) => 75 + i * 16)
          .attr('font-family', 'Arial, sans-serif')
          .attr('font-size', 11)
          .attr('fill', () => {
            const baseColor = calculateTextColor(colorScale(d.data.id));
            return baseColor === '#FFFFFF' ? '#D1D5DB' : '#9CA3AF';
          })
          .text(d => {
            const maxLen = Math.floor(width / 8);
            if (typeof d === 'string') {
              return d.length > maxLen ? d.substring(0, maxLen) + '...' : d;
            }
            const name = d.name || `Node ${d.id}`;
            return name.length > maxLen ? name.substring(0, maxLen) + '...' : name;
          });
      }
    });
    console.timeEnd('Text Rendering');

    function wrapText(text) {
      text.each(function(d) {
        const textElement = d3.select(this);
        const words = textElement.text().split(/\s+/).reverse();
        const lineHeight = 1.1;
        const width = d.x1 - d.x0 - 24; // Account for increased padding
        const fontSize = parseFloat(textElement.attr('font-size'));
        
        let word;
        let line = [];
        let lineNumber = 0;
        const y = textElement.attr('y');
        
        textElement.text(null);
        
        let tspan = textElement.append('tspan')
          .attr('x', textElement.attr('x'))
          .attr('y', y);
        
        while (word = words.pop()) {
          line.push(word);
          tspan.text(line.join(' '));
          
          if (tspan.node().getComputedTextLength() > width && line.length > 1) {
            line.pop();
            tspan.text(line.join(' '));
            line = [word];
            
            tspan = textElement.append('tspan')
              .attr('x', textElement.attr('x'))
              .attr('y', parseFloat(y) + (++lineNumber * lineHeight * fontSize))
              .text(word);
          }
        }
      });
    }

    console.log('Treemap rendering completed');
    console.timeEnd('Treemap Rendering');

  }, [dimensions, currentView, nodeTypeSummary, edgeTypeSummary, filteredNodes, settings]);

  const getTitle = () => {
    if (currentView === 'nodeTypes') return 'Node Types';
    if (currentView === 'edgeTypes') return `Edge Types for ${selectedNodeType}`;
    if (currentView === 'specificNodes') return `Nodes connected via ${selectedEdgeType}`;
    return 'Graph Explorer';
  };

  const getDataCount = () => {
    if (currentView === 'nodeTypes') return nodeTypeSummary.length;
    if (currentView === 'edgeTypes') return edgeTypeSummary.length;
    if (currentView === 'specificNodes') return filteredNodes.length;
    return 0;
  };

  if (isCalculating) {
    return (
      <div className="bg-white rounded-lg shadow p-6 h-full relative flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <div className="text-lg font-medium text-gray-900">Calculating Edge Types...</div>
          <div className="text-sm text-gray-600 mt-2">
            {calculationProgress || `Analyzing ${selectedNodeType ? `${selectedNodeType} connections` : 'data'}`}
          </div>
          <div className="text-xs text-gray-500 mt-4">
            This may take a few seconds for large datasets
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="bg-white rounded-lg shadow p-6 h-full relative">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {getTitle()}
          </h2>
          <div className="text-sm text-gray-600 mt-1">
            {getDataCount()} {currentView === 'specificNodes' ? 'nodes' : 'types'} displayed
          </div>
        </div>
        
        {currentView !== 'nodeTypes' && onBackClick && (
          <button
            onClick={onBackClick}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            ← Back
          </button>
        )}
      </div>

      {/* Treemap SVG */}
      <div className="w-full" style={{ height: dimensions.height }}>
        <svg ref={svgRef} className="w-full h-full border border-gray-200 rounded"></svg>
      </div>

      {/* Instructions */}
      <div className="mt-4 text-sm text-gray-600">
        {currentView === 'nodeTypes' && 'Click on a node type to see its edge types'}
        {currentView === 'edgeTypes' && 'Click on an edge type to see connected nodes'}
        {currentView === 'specificNodes' && 'Click on a node type group to explore recursively'}
      </div>

      {/* Enhanced Tooltip */}
      {tooltip.show && (
        <div
          className="fixed bg-gray-900 text-white px-3 py-2 rounded-lg text-sm z-50 pointer-events-none shadow-lg max-w-xs"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
        >
          <div className="font-semibold">{tooltip.title}</div>
          <div className="text-gray-300 whitespace-pre-line">{tooltip.content}</div>
        </div>
      )}
    </div>
  );
};

export default TreemapView; 
