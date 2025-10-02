import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './App.css';
import TreemapView from './components/TreemapView';
import AttributePanel from './components/AttributePanel';
import QueryBuilder from './components/QueryBuilder';
import SavedQueries from './components/SavedQueries';
import SettingsPanel from './components/SettingsPanel';
import {
  GraphData,
  GraphNode,
  GraphLink,
  ActiveFilters,
  PendingFilters,
  Filter,
  ViewType,
  Settings,
  QueryHistoryEntry,
  EdgeIndex,
  NodeTypeSummary,
  EdgeTypeSummary,
  AttributeAnalysis,
  SavedQuery
} from './types';



function App() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('nodeTypes');
  const [currentQuery, setCurrentQuery] = useState<string[]>([]);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([]);
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);
  const [selectedEdgeType, setSelectedEdgeType] = useState<string | null>(null);
  const [filteredNodes, setFilteredNodes] = useState<GraphNode[]>([]);
  const [showSavedQueries, setShowSavedQueries] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationProgress, setCalculationProgress] = useState('');
  // Derive New Attribute builder state
  const [deriveBuilder, setDeriveBuilder] = useState<{
    active: boolean;
    method: 'path' | 'count' | null;
    name: string;
    path: string[];
    startType: string | null;
  }>({ active: false, method: null, name: '', path: [], startType: null });

  // NEW: Scoped Filter state management
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    nodeFilters: [],
    edgeFilters: []
  });
  const [pendingFilters, setPendingFilters] = useState<PendingFilters>({
    nodeFilters: [],
    edgeFilters: []
  });

  // NEW: Track what type of attributes to show in left panel
  const [showAttributesFor, setShowAttributesFor] = useState<'nodes' | 'edges'>('nodes');

  // Settings state with nice defaults
  const [settings, setSettings] = useState<Settings>({
    nodeColors: ['#0EA5E9', '#0284C7', '#0369A1', '#075985', '#0C4A6E', '#082F49'],
    edgeColors: ['#DC2626', '#B91C1C', '#991B1B', '#7F1D1D', '#450A0A', '#350808'],
    showConnectors: true,
    animateTransitions: true,
    customNodeColors: ['#0EA5E9', '#0284C7', '#0369A1', '#075985', '#0C4A6E', '#082F49'],
    customEdgeColors: ['#DC2626', '#B91C1C', '#991B1B', '#7F1D1D', '#450A0A', '#350808'],
    useCustomColors: false
  });

  // Performance monitoring hook
  const usePerformanceMonitor = (name: string, dependencies: any[]) => {
    const startTime = useRef(Date.now());
    const lastDeps = useRef(dependencies);
    
    useEffect(() => {
      const now = Date.now();
      const timeSinceLastChange = now - startTime.current;
      
      // Check if dependencies actually changed
      const depsChanged = dependencies.some((dep: any, index: number) => dep !== lastDeps.current[index]);
      
      if (depsChanged) {
        console.log(`${name} re-render: ${timeSinceLastChange}ms since last change`);
        startTime.current = now;
        lastDeps.current = dependencies;
      }
    }, dependencies);
  };

  // Monitor key component performance
  usePerformanceMonitor('App Component', [currentView, selectedNodeType, selectedEdgeType]);

  // Performance optimization: Create edge index for fast lookups
  const edgeIndex = useMemo(() => {
    if (!graphData || !graphData.links) return { bySource: new Map(), byTarget: new Map() };
    
    console.time('Building Edge Index');
    console.log('Building edge index for fast lookups...');
    
    const bySource = new Map();
    const byTarget = new Map();
    
    graphData.links.forEach(link => {
      // Index by source
      if (!bySource.has(link.source)) {
        bySource.set(link.source, []);
      }
      bySource.get(link.source).push(link);
      
      // Index by target  
      if (!byTarget.has(link.target)) {
        byTarget.set(link.target, []);
      }
      byTarget.get(link.target).push(link);
    });
    
    console.log('Edge index built:', {
      sourceNodes: bySource.size,
      targetNodes: byTarget.size,
      totalLinks: graphData.links.length
    });
    console.timeEnd('Building Edge Index');
    
    return { bySource, byTarget };
  }, [graphData]);

  // Performance optimization: Memoize edge type calculations with index
  const edgeTypeCache = useMemo(() => new Map(), [graphData]);

  // OPTIMIZED: Pre-built node lookup map for O(1) node finding
  const nodeMap = useMemo(() => {
    if (!graphData?.nodes) return new Map();
    
    console.time('Building Node Map');
    const map = new Map();
    graphData.nodes.forEach(node => {
      map.set(node.id, node);
    });
    console.log(`Node map built: ${map.size} nodes`);
    console.timeEnd('Building Node Map');
    
    return map;
  }, [graphData]);

  // OPTIMIZED: Fast edge types calculation using index and caching
  const getConnectedEdgeTypes = useCallback((nodeType: string): EdgeTypeSummary[] => {
    if (!graphData || !graphData.links || !nodeType) return [];
    
    // Check cache FIRST - return immediately if found
    if (edgeTypeCache.has(nodeType)) {
      console.log(`Cache hit for edge types: ${nodeType}`);
      return edgeTypeCache.get(nodeType);
    }
    
    // Show loading for heavy calculations
    const nodeCount = graphData.nodes.filter(n => n['Node Type'] === nodeType).length;
    if (nodeCount > 5000) {
      setIsCalculating(true);
      setCalculationProgress(`Analyzing ${nodeCount.toLocaleString()} ${nodeType} nodes...`);
    }
    
    console.time(`Edge Types for ${nodeType}`);
    console.log(`Calculating edge types for ${nodeType} (using optimized index)...`);
    
    // Get node IDs for this type (create a Set for O(1) lookup)
    const nodeIds = new Set<string>(
      graphData.nodes
        .filter(node => node['Node Type'] === nodeType)
        .map(node => node.id)
    );
    
    console.log(`Found ${nodeIds.size} nodes of type ${nodeType}`);
    
    const edgeTypeCounts = new Map<string, number>();
    const connectedNodeTypes = new Map<string, Set<string>>();
    
    // Use edge index for much faster lookup
    let processed = 0;
    for (const nodeId of nodeIds) {
      // Update progress for large datasets
      if (nodeIds.size > 5000 && processed % 1000 === 0) {
        setCalculationProgress(`Processing ${processed.toLocaleString()}/${nodeIds.size.toLocaleString()} nodes...`);
      }
      
      // Get edges where this node is source
      const sourceEdges = edgeIndex.bySource.get(nodeId) || [];
      // Get edges where this node is target  
      const targetEdges = edgeIndex.byTarget.get(nodeId) || [];
      
      // Process all connected edges
      [...sourceEdges, ...targetEdges].forEach(link => {
        const edgeType = link['Edge Type'] || 'Unknown';
        edgeTypeCounts.set(edgeType, (edgeTypeCounts.get(edgeType) || 0) + 1);
        
        if (!connectedNodeTypes.has(edgeType)) {
          connectedNodeTypes.set(edgeType, new Set());
        }
        
        // OPTIMIZED: Use node map for O(1) lookup instead of find()
        const otherNodeId = link.source === nodeId ? link.target : link.source;
        const otherNode = nodeMap.get(otherNodeId);
        
        if (otherNode && otherNode['Node Type'] !== nodeType) {
          connectedNodeTypes.get(edgeType)!.add(otherNode['Node Type']);
        }
      });
      
      processed++;
    }

    const result = Array.from(edgeTypeCounts.entries()).map(([type, count]) => ({
      type,
      count,
      connectedNodeTypes: Array.from(connectedNodeTypes.get(type) || [])
    }));
    
    // Cache the result for future use
    edgeTypeCache.set(nodeType, result);
    
    // Clear loading state
    setIsCalculating(false);
    setCalculationProgress('');
    
    console.log(`Edge types calculated for ${nodeType}:`, {
      uniqueEdgeTypes: result.length,
      totalConnections: Array.from(edgeTypeCounts.values()).reduce((a, b) => a + b, 0),
      cacheSize: edgeTypeCache.size
    });
    console.timeEnd(`Edge Types for ${nodeType}`);
    
    return result as EdgeTypeSummary[];
  }, [graphData, edgeIndex, edgeTypeCache, nodeMap]);

  // NEW: Get connected edge types from a specific set of nodes (for filtering support)
  const getConnectedEdgeTypesFromNodes = useCallback((nodeType: string, specificNodes: GraphNode[]): EdgeTypeSummary[] => {
    if (!graphData || !graphData.links || !specificNodes.length) return [];
    
    console.time(`Filtered Edge Types for ${nodeType}`);
    console.log(`Calculating edge types for ${specificNodes.length} filtered ${nodeType} nodes...`);
    
    // Create a Set of node IDs for O(1) lookup
    const nodeIds = new Set<string>(specificNodes.map((node: GraphNode) => node.id));
    
    const edgeTypeCounts = new Map<string, number>();
    const connectedNodeTypes = new Map<string, Set<string>>();
    
    // Use edge index for much faster lookup
    for (const nodeId of nodeIds) {
      // Get edges where this node is source or target
      const sourceEdges = edgeIndex.bySource.get(nodeId) || [];
      const targetEdges = edgeIndex.byTarget.get(nodeId) || [];
      
      // Process all connected edges
      [...sourceEdges, ...targetEdges].forEach(link => {
        const edgeType = link['Edge Type'] || 'Unknown';
        edgeTypeCounts.set(edgeType, (edgeTypeCounts.get(edgeType) || 0) + 1);
        
        if (!connectedNodeTypes.has(edgeType)) {
          connectedNodeTypes.set(edgeType, new Set());
        }
        
        // Get the other node in this edge
        const otherNodeId = link.source === nodeId ? link.target : link.source;
        const otherNode = nodeMap.get(otherNodeId);
        
        if (otherNode && otherNode['Node Type'] !== nodeType) {
          connectedNodeTypes.get(edgeType)!.add(otherNode['Node Type']);
        }
      });
    }

    const result = Array.from(edgeTypeCounts.entries()).map(([type, count]) => ({
      type,
      count,
      connectedNodeTypes: Array.from(connectedNodeTypes.get(type) || [])
    }));
    
    console.log(`Filtered edge types calculated for ${nodeType}:`, {
      inputNodes: specificNodes.length,
      uniqueEdgeTypes: result.length,
      totalConnections: Array.from(edgeTypeCounts.values()).reduce((a, b) => a + b, 0)
    });
    console.timeEnd(`Filtered Edge Types for ${nodeType}`);
    
    return result as EdgeTypeSummary[];
  }, [graphData, edgeIndex, nodeMap]);



  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('graphExplorerSettings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }
  }, []);

  // Save settings to localStorage when changed
  const handleSettingsChange = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    localStorage.setItem('graphExplorerSettings', JSON.stringify(newSettings));
    console.log('Settings updated:', newSettings);
  }, []);

  // Load graph data
  useEffect(() => {
    console.time('Graph Data Loading');
    console.log('Starting graph data fetch...');
    
    fetch('/MC1_graph.json')
      .then(response => {
        console.log('Graph data response received, parsing JSON...');
        console.time('JSON Parsing');
        return response.json();
      })
      .then(data => {
        console.timeEnd('JSON Parsing');
        console.log('Graph data loaded:', {
          nodes: data.nodes?.length || 0,
          links: data.links?.length || 0,
          totalSize: JSON.stringify(data).length
        });
        setGraphData(data);
        setLoading(false);
        console.timeEnd('Graph Data Loading');
      })
      .catch(error => {
        console.error('Error loading graph data:', error);
        console.timeEnd('Graph Data Loading');
        setLoading(false);
      });
  }, []);



  // NEW: Filter application utilities (moved up to resolve declaration order)
  const applyFiltersToNodes = useCallback((nodes: GraphNode[], filters: Filter[]) => {
    if (!filters || filters.length === 0) return nodes;
    
    console.time('Apply Node Filters');
    console.log(`Applying ${filters.length} filters to ${nodes.length} nodes`);
    
    const filtered = nodes.filter((node: GraphNode) => {
      return filters.every((filter: Filter) => {
        const value = (node as any)[filter.attribute];
        
        switch (filter.type) {
          case 'range': {
            const numValue = parseFloat(String(value));
            return !isNaN(numValue) && numValue >= (filter.min ?? numValue) && numValue <= (filter.max ?? numValue);
          }
          case 'categorical':
            return (filter.values ?? []).includes(String(value));
          case 'search':
            return String(value ?? '').toLowerCase().includes(String(filter.value ?? '').toLowerCase());
          case 'date_range': {
            const dateValue = new Date(String(value));
            return (!!filter.startDate ? dateValue >= filter.startDate : true) && (!!filter.endDate ? dateValue <= filter.endDate : true);
          }
          default:
            return true;
        }
      });
    });
    
    console.log(`Filtered ${nodes.length} to ${filtered.length} nodes`);
    console.timeEnd('Apply Node Filters');
    return filtered;
  }, []);

  const applyFiltersToEdges = useCallback((edges: GraphLink[], filters: Filter[]) => {
    if (!filters || filters.length === 0) return edges;
    
    console.time('Apply Edge Filters');
    console.log(`Applying ${filters.length} filters to ${edges.length} edges`);
    
    const filtered = edges.filter((edge: GraphLink) => {
      return filters.every((filter: Filter) => {
        const value = (edge as any)[filter.attribute];
        
        switch (filter.type) {
          case 'range': {
            const numValue = parseFloat(String(value));
            return !isNaN(numValue) && numValue >= (filter.min ?? numValue) && numValue <= (filter.max ?? numValue);
          }
          case 'categorical':
            return (filter.values ?? []).includes(String(value));
          case 'search':
            return String(value ?? '').toLowerCase().includes(String(filter.value ?? '').toLowerCase());
          default:
            return true;
        }
      });
    });
    
    console.log(`Filtered ${edges.length} to ${filtered.length} edges`);
    console.timeEnd('Apply Edge Filters');
    return filtered;
  }, []);

  // NEW: Apply cascading filters through the entire query path
  const applyCascadingFilters = useCallback((nodes: GraphNode[], queryPath: string[]) => {
    if (!queryPath || queryPath.length === 0) return nodes;
    
    console.log(`Applying cascading filters through query path: ${queryPath.join(' → ')}`);
    let filteredNodes = [...nodes];
    
    // Walk through the query path and apply filters progressively
    for (let stepIndex = 0; stepIndex < queryPath.length; stepIndex++) {
      const stepContext = queryPath[stepIndex];
      
      // Get all filters for this step
      const stepFilters = activeFilters.nodeFilters.filter((filter: Filter) => 
        filter.queryStep === stepIndex && filter.queryContext === stepContext
      );
      
      if (stepFilters.length > 0) {
        console.log(`Step ${stepIndex} (${stepContext}): Applying ${stepFilters.length} filters`);
        filteredNodes = applyFiltersToNodes(filteredNodes, stepFilters);
        console.log(`After step ${stepIndex}: ${filteredNodes.length} nodes remaining`);
      }
    }
    
    return filteredNodes;
  }, [activeFilters.nodeFilters, applyFiltersToNodes]);


  // OPTIMIZED: Enhanced function to find nodes connected through edge type with cascading filter support
  const findConnectedNodes = useCallback((fromNodeType: string, edgeType: string, baseNodes: GraphNode[] | null = null) => {
    if (!graphData) return [];
    
    console.time(`Find Connected Nodes: ${fromNodeType} → ${edgeType}`);
    console.log(`Finding nodes connected via ${fromNodeType} → ${edgeType} (with cascading filters)...`);
    
    // Use base nodes if provided (for maintaining filters), otherwise use all nodes of type
    let sourceNodes = baseNodes 
      ? baseNodes.filter((node: GraphNode) => node['Node Type'] === fromNodeType)
      : graphData.nodes.filter((node: GraphNode) => node['Node Type'] === fromNodeType);
    
    // Apply cascading filters to source nodes if no baseNodes provided
    if (!baseNodes && currentQuery.length > 0) {
      sourceNodes = applyCascadingFilters(sourceNodes, currentQuery);
      console.log(`Applied cascading filters to source nodes: ${sourceNodes.length} remaining`);
    }
    
    const sourceNodeIds = new Set(sourceNodes.map(node => node.id));
    console.log(`Source nodes: ${sourceNodeIds.size} (filtered from ${baseNodes ? baseNodes.length : 'all'})`);
    
    const connectedNodeIds = new Set<string>();

    // Use edge index for faster lookup
    for (const nodeId of sourceNodeIds) {
      const sourceEdges = edgeIndex.bySource.get(nodeId) || [];
      const targetEdges = edgeIndex.byTarget.get(nodeId) || [];
      
      [...sourceEdges, ...targetEdges]
        .filter((link: GraphLink) => link['Edge Type'] === edgeType)
        .forEach((link: GraphLink) => {
          const otherNodeId = link.source === nodeId ? link.target : link.source;
          connectedNodeIds.add(otherNodeId);
        });
    }
    
    const result = graphData.nodes.filter((node: GraphNode) => 
      connectedNodeIds.has(node.id) && node['Node Type'] !== fromNodeType
    );
    
    console.log(`Connected nodes found: ${result.length} nodes`, {
      uniqueTargetTypes: [...new Set(result.map(n => n['Node Type']))]
    });
    console.timeEnd(`Find Connected Nodes: ${fromNodeType} → ${edgeType}`);
    
    return result;
  }, [graphData, edgeIndex, applyCascadingFilters, currentQuery]);

     // Handle node type selection with context preservation
   const handleNodeTypeClick = useCallback((nodeType: string) => {
     if (deriveBuilder.active && deriveBuilder.method === 'path') {
       setDeriveBuilder(prev => {
         const nextPath = [...prev.path];
         if (nextPath.length === 0) {
           nextPath.push(nodeType);
           return { ...prev, startType: nodeType, path: nextPath };
         } else {
           if (nextPath.length % 2 === 1) {
             nextPath.push(nodeType);
           }
           return { ...prev, path: nextPath };
         }
       });
     }
     console.time(`Node Type Click: ${nodeType}`);
     console.log(`Node type clicked: ${nodeType} (from view: ${currentView})`);
     
     // Save current state to history
     setQueryHistory(prev => [...prev, {
       view: currentView,
       selectedNodeType,
       selectedEdgeType,
       query: [...currentQuery],
       filteredNodes: [...filteredNodes]
     }]);

     // Show node attributes in left panel
     setShowAttributesFor('nodes');

     if (currentView === 'specificNodes') {
       // In recursive mode: maintain the existing context but explore this new node type
       // This preserves any previous filters while exploring the new node type
       console.log(`Recursive navigation: maintaining ${filteredNodes.length} filtered nodes`);
       setSelectedNodeType(nodeType);
       setSelectedEdgeType(null);
       setCurrentQuery([...currentQuery, nodeType]); // Append instead of replace
       setCurrentView('edgeTypes');
       // Keep filteredNodes as context for the new exploration
     } else {
       // Normal navigation from nodeTypes view
       console.log('Normal navigation: resetting context');
       setSelectedNodeType(nodeType);
       setSelectedEdgeType(null);
       setCurrentQuery([nodeType]);
       setCurrentView('edgeTypes');
       setFilteredNodes([]);
     }
     
     console.timeEnd(`Node Type Click: ${nodeType}`);
   }, [currentView, selectedNodeType, selectedEdgeType, currentQuery, filteredNodes]);

     // Handle edge type selection with recursive capability
   const handleEdgeTypeClick = useCallback((edgeType: string) => {
     if (deriveBuilder.active && deriveBuilder.method === 'path') {
       setDeriveBuilder(prev => {
         const nextPath = [...prev.path];
         if (nextPath.length % 2 === 1 || nextPath.length === 0) {
           nextPath.push(edgeType);
         }
         return { ...prev, path: nextPath };
       });
     }
     console.time(`Edge Type Click: ${edgeType}`);
     console.log(`Edge type clicked: ${edgeType}`);
     
     // Save current state to history
     setQueryHistory(prev => [...prev, {
       view: currentView,
       selectedNodeType,
       selectedEdgeType,
       query: [...currentQuery],
       filteredNodes: [...filteredNodes]
     }]);

     // Show edge attributes in left panel
     setShowAttributesFor('edges');

     setSelectedEdgeType(edgeType);
     setCurrentQuery([...currentQuery, edgeType]);
     setCurrentView('specificNodes');
     
     // Find nodes connected through this edge type, respecting current context
     const baseContext = currentView === 'edgeTypes' ? null : filteredNodes;
     if (!selectedNodeType) {
       console.warn('No selectedNodeType; cannot find connected nodes.');
     console.timeEnd(`Edge Type Click: ${edgeType}`);
       return;
     }
     const connectedNodes = findConnectedNodes(selectedNodeType, edgeType, baseContext);
     setFilteredNodes(connectedNodes);
     
     console.timeEnd(`Edge Type Click: ${edgeType}`);
   }, [currentView, selectedNodeType, currentQuery, filteredNodes, findConnectedNodes]);

     // Handle clicking on query pills for navigation
   const handleNavigateToQueryIndex = useCallback((clickedIndex: number) => {
     console.time(`Query Navigation to Index ${clickedIndex}`);
     console.log(`Navigating to query index ${clickedIndex}`);
     
     const targetQuery = currentQuery.slice(0, clickedIndex + 1);
     
     if (targetQuery.length === 1) {
       // Navigate to edge types for this node type
       const nodeType = targetQuery[0];
       setSelectedNodeType(nodeType);
       setSelectedEdgeType(null);
       setCurrentQuery([nodeType]);
       setCurrentView('edgeTypes');
       setFilteredNodes([]);
       setShowAttributesFor('nodes'); // Show node attributes when navigating to a node
     } else if (targetQuery.length === 2) {
       // Navigate to specific nodes for this node type + edge type
       const [nodeType, edgeType] = targetQuery;
       const connectedNodes = findConnectedNodes(nodeType, edgeType);
       
       setSelectedNodeType(nodeType);
       setSelectedEdgeType(edgeType);
       setCurrentQuery([nodeType, edgeType]);
       setCurrentView('specificNodes');
       setFilteredNodes(connectedNodes);
       setShowAttributesFor('edges'); // Show edge attributes when navigating to an edge
     }
     
     // Clear query history since we're jumping to a specific state
     setQueryHistory([]);
     
     console.timeEnd(`Query Navigation to Index ${clickedIndex}`);
   }, [currentQuery, findConnectedNodes]);

     // Handle query reset
   const resetQuery = useCallback(() => {
     console.log('Resetting query to initial state');
     setCurrentQuery([]);
     setQueryHistory([]);
     setSelectedNodeType(null);
     setSelectedEdgeType(null);
     setCurrentView('nodeTypes');
     setFilteredNodes([]);
     setShowAttributesFor('nodes'); // Default to showing node attributes
   }, []);

   // Handle back navigation
   const handleBackClick = useCallback(() => {
     console.log('Back button clicked');
     if (queryHistory.length === 0) {
       // No history, go to start
       resetQuery();
       return;
     }

     const lastState = queryHistory[queryHistory.length - 1];
     setQueryHistory(prev => prev.slice(0, -1));
     
     setCurrentView(lastState.view);
     setSelectedNodeType(lastState.selectedNodeType);
     setSelectedEdgeType(lastState.selectedEdgeType);
     setCurrentQuery(lastState.query);
     setFilteredNodes(lastState.filteredNodes);
     
     // Set attributes panel based on what was last selected
     if (lastState.selectedEdgeType) {
       setShowAttributesFor('edges');
     } else {
       setShowAttributesFor('nodes');
     }
   }, [queryHistory, resetQuery]);

  // Save current query (made async to prevent freezing)
  const saveCurrentQuery = useCallback(async (name: string, notes: string = ''): Promise<void> => {
    console.time('Save Query');
    console.log(`Saving query: ${name}`);
    
    return new Promise<void>((resolve) => {
      // Use setTimeout to make this async and prevent UI freezing
      setTimeout(() => {
        const newQuery = {
          id: Date.now(),
          name,
          query: [...currentQuery],
          notes,
          timestamp: new Date().toISOString(),
          state: {
            view: currentView,
            selectedNodeType,
            selectedEdgeType,
            currentQuery: [...currentQuery],
            filteredNodes: [...filteredNodes],
            activeFilters: { nodeFilters: [...activeFilters.nodeFilters], edgeFilters: [...activeFilters.edgeFilters] },
            pendingFilters: { nodeFilters: [...pendingFilters.nodeFilters], edgeFilters: [...pendingFilters.edgeFilters] },
            showAttributesFor
          }
        };
        setSavedQueries((prev: SavedQuery[]) => [...prev, newQuery]);
        setShowSavedQueries(true);
        console.log('Query saved successfully');
        console.timeEnd('Save Query');
        resolve();
      }, 0);
    });
  }, [currentQuery]);

  // Derivation helpers
  const computeDerivedBoolean = useCallback((name: string, startType: string, path: string[], endFilters: Filter[]) => {
    if (!graphData) return;
    if (path.length < 3 || path.length % 2 === 0) return; // Need NodeType -> EdgeType -> NodeType (at least)

    // Identify end node type (last in path)
    const endNodeType = path[path.length - 1];

    // Prepare set of end nodes that satisfy filters
    let endNodes: GraphNode[] = graphData.nodes.filter(n => n['Node Type'] === endNodeType);
    if (endFilters && endFilters.length > 0) {
      endNodes = applyFiltersToNodes(endNodes, endFilters);
    }
    const endSet = new Set<string>(endNodes.map(n => n.id));

    // Backward traversal from endSet to startType using reversed path
    // path pattern: [N0, E0, N1, E1, N2, ... Nk]
    // Traverse steps: for j from last edge back to first edge
    let currentSet = new Set<string>(endSet);
    for (let j = path.length - 2; j >= 1; j -= 2) {
      const edgeType = path[j];
      const expectedNodeType = path[j - 1];
      const prevSet = new Set<string>();
      // For all nodes of expectedNodeType, if it connects via edgeType to any node in currentSet, include it
      const candidates = graphData.nodes.filter(n => n['Node Type'] === expectedNodeType);
      for (const node of candidates) {
        const sourceEdges = edgeIndex.bySource.get(node.id) || [];
        const targetEdges = edgeIndex.byTarget.get(node.id) || [];
        let found = false;
        for (const link of [...sourceEdges, ...targetEdges]) {
          if (link['Edge Type'] !== edgeType) continue;
          const otherId = link.source === node.id ? link.target : link.source;
          if (currentSet.has(otherId)) { found = true; break; }
        }
        if (found) prevSet.add(node.id);
      }
      currentSet = prevSet;
    }

    // Now currentSet contains start-type nodes that satisfy the rule
    const updatedNodes = graphData.nodes.map(n => {
      if (n['Node Type'] === startType) {
        return { ...n, [name]: currentSet.has(n.id) } as GraphNode;
      }
      return n;
    });
    setGraphData({ ...graphData, nodes: updatedNodes });
  }, [graphData, edgeIndex, applyFiltersToNodes]);

  const computeDerivedCount = useCallback((name: string, scopeType: string) => {
    if (!graphData) return;
    const updatedNodes = graphData.nodes.map(n => {
      if (n['Node Type'] !== scopeType) return n;
      const deg = (edgeIndex.bySource.get(n.id)?.length || 0) + (edgeIndex.byTarget.get(n.id)?.length || 0);
      return { ...n, [name]: deg } as GraphNode;
    });
    setGraphData({ ...graphData, nodes: updatedNodes });
  }, [graphData, edgeIndex]);
  // OPTIMIZED: Memoized edge types with cascading filter support (moved after applyFiltersToNodes)
  const memoizedEdgeTypes = useMemo(() => {
    if (currentView !== 'edgeTypes' || !selectedNodeType) return [];
    
    // Get nodes of the selected type and apply cascading filters
    let targetNodes = graphData?.nodes?.filter(node => node['Node Type'] === selectedNodeType) || [];
    targetNodes = applyCascadingFilters(targetNodes, currentQuery);
    
    console.log(`Edge types calculation using ${targetNodes.length} cascading-filtered ${selectedNodeType} nodes`);
    
    // Use a modified version that works with specific nodes
    return getConnectedEdgeTypesFromNodes(selectedNodeType, targetNodes);
  }, [currentView, selectedNodeType, graphData, applyCascadingFilters, currentQuery, getConnectedEdgeTypesFromNodes]);

  // Memoized node type summary with cascading filter support (moved after applyFiltersToNodes)
  const nodeTypeSummary = useMemo(() => {
    if (!graphData || !graphData.nodes) return [];
    
    console.time('Node Type Summary Calculation');
    console.log('Calculating cascading filtered node type summary...');
    
    // Apply cascading filters through the entire query path for treemap view
    let filteredNodes = applyCascadingFilters(graphData.nodes, currentQuery);
    
    const nodeTypeCounts: Record<string, number> = {};
    const nodeTypeExamples: Record<string, GraphNode[]> = {};
    
    filteredNodes.forEach((node: GraphNode) => {
      const type = node['Node Type'] || 'Unknown';
      nodeTypeCounts[type] = (nodeTypeCounts[type] || 0) + 1;
      
      if (!nodeTypeExamples[type]) {
        nodeTypeExamples[type] = [];
      }
      if (nodeTypeExamples[type].length < 5) {
        nodeTypeExamples[type].push(node);
      }
    });

    const result: NodeTypeSummary[] = Object.entries(nodeTypeCounts).map(([type, count]) => ({
      type,
      count: count as number,
      examples: nodeTypeExamples[type] || []
    }));
    
    console.log('Cascading filtered node type summary calculated:', {
      uniqueTypes: result.length,
      totalNodes: filteredNodes.length,
      originalNodes: graphData.nodes.length,
      querySteps: currentQuery.length,
      largestType: [...result].sort((a, b) => (b.count as number) - (a.count as number))[0]
    });
    console.timeEnd('Node Type Summary Calculation');
    
    return result;
  }, [graphData, applyCascadingFilters, currentQuery]);

  // NEW: Add/Update/Remove filter functions with query step context
  const addPendingFilter = useCallback((type: keyof PendingFilters, filter: Partial<Filter> | null) => {
    if (!filter) {
      // No-op for clearing from AttributePanel; removal is handled via removePendingFilter
      return;
    }
    // Add query step context to the filter
    const currentQueryStep = currentQuery.length - 1; // Current step index
    const currentQueryContext = currentQuery[currentQueryStep]; // Current node/edge type
    
    const scopedFilter: Filter = {
      ...(filter as Filter),
      queryStep: currentQueryStep,
      queryContext: currentQueryContext || 'root'
    };
    
    console.log(`Adding scoped pending ${type} filter:`, scopedFilter);
    setPendingFilters((prev: PendingFilters) => ({
      ...prev,
      [type]: (prev[type] as Filter[]).filter((f: Filter) => f.attribute !== (filter as Filter).attribute).concat([scopedFilter])
    }));
  }, [currentQuery]);

  const removePendingFilter = useCallback((type: keyof PendingFilters, attribute: string, queryStep: number | null = null) => {
    console.log(`Removing pending ${type} filter: ${attribute} (step: ${queryStep})`);
    setPendingFilters((prev: PendingFilters) => ({
      ...prev,
      [type]: (prev[type] as Filter[]).filter((f: Filter) => {
        if (queryStep !== null) {
          // Remove filter with specific attribute and query step
          return !(f.attribute === attribute && f.queryStep === queryStep);
        } else {
          // Remove all filters with this attribute (legacy behavior)
          return f.attribute !== attribute;
        }
      })
    }));
  }, []);

     // NEW: Finalize all pending filters (move them to active)
   const finalizeAllFilters = useCallback(() => {
     console.log('Finalizing all pending filters');
     
     setActiveFilters(prev => ({
       nodeFilters: [...prev.nodeFilters, ...pendingFilters.nodeFilters],
       edgeFilters: [...prev.edgeFilters, ...pendingFilters.edgeFilters]
     }));
     
     // Clear all pending filters
     setPendingFilters({
       nodeFilters: [],
       edgeFilters: []
     });
   }, [pendingFilters]);

   // NEW: Clear all pending filters
   const clearAllPendingFilters = useCallback(() => {
     console.log('Clearing all pending filters');
     setPendingFilters({
       nodeFilters: [],
       edgeFilters: []
     });
   }, []);

   // NEW: Remove specific active filter by attribute and query step (for deletion from query pills)
   const removeActiveFilter = useCallback((type: keyof ActiveFilters, attribute: string, queryStep: number | null = null) => {
     console.log(`Removing active ${type} filter: ${attribute} (step: ${queryStep})`);
    setActiveFilters((prev: ActiveFilters) => ({
      ...prev,
      [type]: (prev[type] as Filter[]).filter((f: Filter) => {
        if (queryStep !== null) {
          // Remove filter with specific attribute and query step
          return !(f.attribute === attribute && f.queryStep === queryStep);
        } else {
          // Remove all filters with this attribute (legacy behavior)
          return f.attribute !== attribute;
        }
      })
    }));
  }, []);

   const saveFiltersToQuery = useCallback((type: keyof ActiveFilters) => {
     console.log(`Saving ${type} filters to active query`);
     // Note: This is now just for immediate finalization if needed
     finalizeAllFilters();
   }, [finalizeAllFilters]);



  // OPTIMIZED: Get current nodes for attribute analysis with cascading filter support
  const getCurrentNodes = useMemo<GraphNode[]>(() => {
    console.time('Get Current Nodes');
    console.log(`Getting current nodes for view: ${currentView}`);
    
    let result: GraphNode[] = [];
    if (currentView === 'nodeTypes') {
      result = graphData?.nodes || [];
    } else if (currentView === 'edgeTypes' && selectedNodeType) {
      result = graphData?.nodes?.filter(node => node['Node Type'] === selectedNodeType) || [];
    } else if (currentView === 'specificNodes') {
      result = filteredNodes;
    }
    
    // Apply cascading filters through the entire query path
    result = applyCascadingFilters(result, currentQuery);
    
    console.log(`Current nodes count: ${result.length} (after cascading filters through ${currentQuery.length} query steps)`);
    console.timeEnd('Get Current Nodes');
    return result;
  }, [currentView, selectedNodeType, filteredNodes, graphData, applyCascadingFilters, currentQuery]);

  // OPTIMIZED: Get current edges using index with cascading filter support
  const getCurrentEdges = useMemo<GraphLink[]>(() => {
    console.time('Get Current Edges');
    console.log(`Getting current edges for view: ${currentView} (optimized)`);
    
    if (!graphData || !graphData.links) {
      console.timeEnd('Get Current Edges');
      return [] as GraphLink[];
    }
    
    let result: GraphLink[] = [];
    if (currentView === 'edgeTypes' && selectedNodeType) {
      // Get nodes that have been filtered through the entire query path
      const filteredNodes = applyCascadingFilters(
        graphData.nodes.filter(node => node['Node Type'] === selectedNodeType),
        currentQuery
      );
      
      // Use Set for O(1) lookup instead of Array.includes
      const nodeIds = new Set(filteredNodes.map(node => node.id));
      
      // Use edge index for faster filtering
      const edgeSet = new Set<GraphLink>();
      for (const nodeId of nodeIds) {
        const sourceEdges = edgeIndex.bySource.get(nodeId) || [];
        const targetEdges = edgeIndex.byTarget.get(nodeId) || [];
        [...sourceEdges, ...targetEdges].forEach(edge => edgeSet.add(edge));
      }
      
      result = Array.from(edgeSet);
    } else if (currentView === 'specificNodes' && selectedEdgeType) {
      result = graphData.links.filter(link => link['Edge Type'] === selectedEdgeType);
    } else {
      result = graphData.links;
    }
    
    // Apply edge filters for the current step only
    const currentQueryStep = currentQuery.length - 1;
    const currentQueryContext = currentQuery[currentQueryStep];
    const relevantFilters = activeFilters.edgeFilters.filter(filter => 
      filter.queryStep === currentQueryStep && filter.queryContext === currentQueryContext
    );
    
    result = applyFiltersToEdges(result, relevantFilters);
    
    console.log(`Current edges count: ${result.length} (after cascading node filters + ${relevantFilters.length} edge filters)`);
    console.timeEnd('Get Current Edges');
    return result;
  }, [currentView, selectedNodeType, selectedEdgeType, graphData, edgeIndex, activeFilters.edgeFilters, applyFiltersToEdges, applyCascadingFilters, currentQuery]);

  // Get context-aware attribute title
  const getAttributeTitle = useCallback(() => {
    if (currentView === 'nodeTypes') {
      return 'Node Attributes: All Types';
    } else if (currentView === 'edgeTypes' && selectedNodeType) {
      return `Node Attributes: ${selectedNodeType}`;
    } else if (currentView === 'specificNodes' && selectedNodeType && selectedEdgeType) {
      return `Node Attributes: ${selectedNodeType} → ${selectedEdgeType}`;
    }
    return 'Node Attributes';
  }, [currentView, selectedNodeType, selectedEdgeType]);

  // Get context-aware edge attribute title
  const getEdgeAttributeTitle = useCallback(() => {
    if (currentView === 'edgeTypes' && selectedNodeType) {
      return `Edge Attributes: ${selectedNodeType} Connections`;
    } else if (currentView === 'specificNodes' && selectedEdgeType) {
      return `Edge Attributes: ${selectedEdgeType}`;
    }
    return 'Edge Attributes';
  }, [currentView, selectedNodeType, selectedEdgeType]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">Loading graph data...</div>
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl text-red-600">Error loading graph data</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Aggregated Graph Explorer
            </h1>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                {graphData.nodes?.length || 0} nodes, {graphData.links?.length || 0} edges
              </div>
              <div className="text-xs text-green-600">
                Cache: {edgeTypeCache.size} types
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Right-side toggle handle for Saved Queries panel */}
      <button
        onClick={() => setShowSavedQueries(true)}
        className={`fixed top-1/2 right-0 -translate-y-1/2 z-40 bg-white border border-gray-200 shadow px-2 py-3 rounded-l ${showSavedQueries ? 'hidden' : ''}`}
        title="Open Saved Queries"
      >
        <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V4H2v16h5m10 0V8m0 12l-5-3-5 3V8l5 3 5-3" />
        </svg>
      </button>

      {/* Query Builder */}
      <QueryBuilder 
        currentQuery={currentQuery}
        onQueryChange={setCurrentQuery}
        onReset={resetQuery}
        onSave={saveCurrentQuery}
        onToggleSavedQueries={() => setShowSavedQueries(!showSavedQueries)}
        onNavigateToQueryIndex={handleNavigateToQueryIndex}
        activeFilters={activeFilters}
        onRemoveFilter={removeActiveFilter}
      />

      {/* Pending Filters Display */}
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
      </div>

      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6 h-[calc(100vh-200px)] relative">
          {/* Left Side - Contextual Attributes Panel (Full Height) */}
          <div className="w-80 flex-shrink-0 h-full overflow-y-auto relative">
            {/* Derive New Attribute Controls */}
            <div className="p-3 border-b bg-white sticky top-0 z-10">
              {!deriveBuilder.active ? (
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setDeriveBuilder({ active: true, method: 'path', name: '', path: [], startType: selectedNodeType })}
                    className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2"
                    title="Derive a new attribute via path or count"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6"/></svg>
                    Derive New Attribute
                  </button>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="hidden sm:inline">Selection mode off</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={deriveBuilder.name}
                      onChange={(e) => setDeriveBuilder(prev => ({ ...prev, name: e.target.value }))}
                      placeholder={deriveBuilder.method === 'count' ? 'Attribute name (e.g., degree)' : 'Attribute name (e.g., isSynthArtist)'}
                      className="flex-1 px-2 py-1 text-sm border rounded"
                    />
                    <select
                      value={deriveBuilder.method || 'path'}
                      onChange={(e) => setDeriveBuilder(prev => ({ ...prev, method: (e.target.value as 'path'|'count') }))}
                      className="px-2 py-1 text-sm border rounded bg-white"
                    >
                      <option value="path">Path-based</option>
                      <option value="count">Count-based</option>
                    </select>
                  </div>
                  {deriveBuilder.method === 'path' ? (
                    <div className="text-xs text-gray-700">
                      <div className="font-medium">Selection mode: Click an edge, then a node on the canvas to build a path.</div>
                      <div className="mt-1"><span className="text-gray-500">Path:</span> {deriveBuilder.path.length > 0 ? deriveBuilder.path.join(' → ') : 'Start by selecting a node type or edge'}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => {
                            // Use filters of current end context if any
                            if (!deriveBuilder.name || !deriveBuilder.startType || deriveBuilder.path.length < 3) return;
                            const currentStep = currentQuery.length - 1;
                            const endContext = deriveBuilder.path[deriveBuilder.path.length - 1];
                            const endFilters = activeFilters.nodeFilters.filter(f => f.queryStep === currentStep && f.queryContext === endContext);
                            computeDerivedBoolean(deriveBuilder.name, deriveBuilder.startType, deriveBuilder.path, endFilters);
                            setDeriveBuilder({ active: false, method: null, name: '', path: [], startType: null });
                          }}
                          className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                          disabled={!deriveBuilder.name || !deriveBuilder.startType || deriveBuilder.path.length < 3}
                        >
                          Create Derived Attribute
                        </button>
                        <button
                          onClick={() => setDeriveBuilder({ active: false, method: null, name: '', path: [], startType: null })}
                          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-700">
                      <div className="font-medium">Count-based: define quantitative attributes like degree.</div>
                      <div className="mt-1">Scope: {selectedNodeType || 'Select a node type from the canvas'}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (!deriveBuilder.name || !selectedNodeType) return;
                            computeDerivedCount(deriveBuilder.name, selectedNodeType);
                            setDeriveBuilder({ active: false, method: null, name: '', path: [], startType: null });
                          }}
                          className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                          disabled={!deriveBuilder.name || !selectedNodeType}
                        >
                          Create Derived Attribute
                        </button>
                        <button
                          onClick={() => setDeriveBuilder({ active: false, method: null, name: '', path: [], startType: null })}
                          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {showAttributesFor === 'nodes' ? (
              // Node Attributes Panel
              <AttributePanel 
                graphData={graphData}
                currentNodes={getCurrentNodes}
                title={getAttributeTitle()}
                filterType="nodeFilters"
                pendingFilters={pendingFilters.nodeFilters}
                onAddFilter={addPendingFilter}
                onRemoveFilter={removePendingFilter}
                onSaveFilters={saveFiltersToQuery}
                allPendingFilters={pendingFilters}
                onFinalize={finalizeAllFilters}
                onClearAll={clearAllPendingFilters}
              />
            ) : (
              // Edge Attributes Panel
              <AttributePanel 
                graphData={graphData}
                currentNodes={getCurrentEdges}
                title={getEdgeAttributeTitle()}
                filterType="edgeFilters"
                pendingFilters={pendingFilters.edgeFilters}
                onAddFilter={addPendingFilter}
                onRemoveFilter={removePendingFilter}
                onSaveFilters={saveFiltersToQuery}
                allPendingFilters={pendingFilters}
                onFinalize={finalizeAllFilters}
                onClearAll={clearAllPendingFilters}
              />
            )}
          </div>

          {/* Main Treemap View */}
          <div className="flex-1 min-w-0">
            <TreemapView
              graphData={graphData}
              currentView={currentView}
              selectedNodeType={selectedNodeType}
              selectedEdgeType={selectedEdgeType}
              nodeTypeSummary={nodeTypeSummary}
              edgeTypeSummary={currentView === 'edgeTypes' ? memoizedEdgeTypes : []}
              filteredNodes={filteredNodes}
              onNodeTypeClick={handleNodeTypeClick}
              onEdgeTypeClick={handleEdgeTypeClick}
              onBackClick={handleBackClick}
              settings={settings}
              isCalculating={isCalculating}
              calculationProgress={calculationProgress}
            />
          </div>

          {/* Right Side - Pop-out Panels */}
          {/* Right Slide-out: Saved Queries Panel */}
          <div
            className={`fixed right-0 top-0 h-full w-96 z-50 transform transition-transform duration-300 ${showSavedQueries ? 'translate-x-0' : 'translate-x-full'}`}
          >
            <div className="h-full bg-white border-l border-gray-200 shadow-xl">
              <SavedQueries 
                savedQueries={savedQueries}
                onLoadQuery={(query: SavedQuery) => {
                  // Restore full saved state
                  const s = query.state;
                  setCurrentView(s.view);
                  setSelectedNodeType(s.selectedNodeType);
                  setSelectedEdgeType(s.selectedEdgeType);
                  setCurrentQuery([...s.currentQuery]);
                  setFilteredNodes([...s.filteredNodes]);
                  setActiveFilters({
                    nodeFilters: [...s.activeFilters.nodeFilters],
                    edgeFilters: [...s.activeFilters.edgeFilters]
                  });
                  setPendingFilters({
                    nodeFilters: [...s.pendingFilters.nodeFilters],
                    edgeFilters: [...s.pendingFilters.edgeFilters]
                  });
                  setShowAttributesFor(s.showAttributesFor);
                  setShowSavedQueries(false);
                }}
                onDeleteQuery={(id: number) => {
                  setSavedQueries(savedQueries.filter((q: SavedQuery) => q.id !== id));
                }}
                onClose={() => setShowSavedQueries(false)}
              />
            </div>
          </div>
          {showSavedQueries && (
            <div
              className="fixed inset-0 bg-black bg-opacity-30 z-40"
              onClick={() => setShowSavedQueries(false)}
            />
          )}

          {/* Settings Panel */}
          {showSettings && (
            <SettingsPanel
              settings={settings}
              onSettingsChange={handleSettingsChange}
              onClose={() => setShowSettings(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
