import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './App.css';
import TreemapView from './components/TreemapView';
import AttributePanel from './components/AttributePanel';
import QueryBuilder from './components/QueryBuilder';
import SavedQueries from './components/SavedQueries';
import SettingsPanel from './components/SettingsPanel';
import DeriveAttributePanel from './components/DeriveAttributePanel';
import { CypherService } from './services/cypher';
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
  NodeTypeSummary,
  EdgeTypeSummary,
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
  // Cypher backend toggle and derived state
  const cypherEnabled = useMemo(() => CypherService.isEnabled(), []);
  const [edgeTypeSummaryCypher, setEdgeTypeSummaryCypher] = useState<EdgeTypeSummary[]>([]);
  const [nodeTypeSummaryCypher, setNodeTypeSummaryCypher] = useState<NodeTypeSummary[]>([]);
  const [currentEdgesCypher, setCurrentEdgesCypher] = useState<GraphLink[]>([]);

  // Derive New Attribute builder state
  const [deriveBuilder, setDeriveBuilder] = useState<{
    active: boolean;
    stage: 'subquery' | 'measure' | null;
    method: 'path' | 'count' | null;
    name: string;
    path: string[]; // [N, E, N, ...]
    startType: string | null;
    // Measure builder selections
    measureType: 'boolean' | 'numeric' | 'categorical' | null;
    measureOp: string | null;
    measureProp: string | null;
    measurePropContext: 'node' | 'edge' | null;
    // Original navigation state to restore after derivation
    originalQuery?: string[];
    originalView?: ViewType;
    originalSelectedNodeType?: string | null;
    originalSelectedEdgeType?: string | null;
    originalFilteredNodes?: GraphNode[];
  }>({ active: false, stage: null, method: null, name: '', path: [], startType: null, measureType: null, measureOp: null, measureProp: null, measurePropContext: null });

  // Always-fresh derive state for event handlers (e.g., D3) that may call stale closures
  const deriveRef = useRef(deriveBuilder);
  useEffect(() => { deriveRef.current = deriveBuilder; }, [deriveBuilder]);

  // Derive debug: watch path updates
  useEffect(() => {
    if (!deriveBuilder.active) return;
  }, [deriveBuilder.path]);

  // Derive Debug: active/stage transitions
  const prevDeriveActiveRef = useRef<boolean>(deriveBuilder.active);
  const prevDeriveStageRef = useRef<typeof deriveBuilder.stage>(deriveBuilder.stage);
  useEffect(() => {
    if (prevDeriveActiveRef.current !== deriveBuilder.active) {
      prevDeriveActiveRef.current = deriveBuilder.active;
    }
    if (prevDeriveStageRef.current !== deriveBuilder.stage) {
      prevDeriveStageRef.current = deriveBuilder.stage;
    }
  }, [deriveBuilder.active, deriveBuilder.stage]);

  // Derive Debug: finalize disabled state reasons
  useEffect(() => {
    if (!deriveBuilder.active || deriveBuilder.stage !== 'subquery') return;
    const len = deriveBuilder.path.length;
    const endsOnNode = len % 2 === 1;
  }, [deriveBuilder.path, deriveBuilder.stage, deriveBuilder.active]);

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

  // View/selection debug
  useEffect(() => {
  }, [currentView, selectedNodeType, selectedEdgeType, showAttributesFor]);

  // Settings state with Vercel-inspired monochrome defaults
  const [settings, setSettings] = useState<Settings>({
    colorPalette: 'classic',
    nodeColor: '#000000',
    edgeColor: '#ffffff',
    nodeTypeColors: ['#000000', '#000000', '#000000', '#000000', '#000000', '#000000'],
    edgeTypeColors: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'],
    showConnectors: true,
    animateTransitions: true
  });

  // Performance monitoring hook
  const usePerformanceMonitor = (name: string, dependencies: any[]) => {
    const startTime = useRef(Date.now());
    const lastDeps = useRef(dependencies);
    
    useEffect(() => {
      const now = Date.now();
      
      // Check if dependencies actually changed
      const depsChanged = dependencies.some((dep: any, index: number) => dep !== lastDeps.current[index]);
      
      if (depsChanged) {
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
    
    
    return { bySource, byTarget };
  }, [graphData]);

  // Performance optimization: Memoize edge type calculations with index
  const edgeTypeCache = useMemo(() => new Map(), [graphData]);

  // OPTIMIZED: Pre-built node lookup map for O(1) node finding
  const nodeMap = useMemo(() => {
    if (!graphData?.nodes) return new Map();
    
    const map = new Map();
    graphData.nodes.forEach(node => {
      map.set(node.id, node);
    });
    
    return map;
  }, [graphData]);


  // NEW: Get connected edge types from a specific set of nodes (for filtering support)
  const getConnectedEdgeTypesFromNodes = useCallback((nodeType: string, specificNodes: GraphNode[]): EdgeTypeSummary[] => {
    if (!graphData || !graphData.links || !specificNodes.length) return [];
    
    
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
    
    
    return result as EdgeTypeSummary[];
  }, [graphData, edgeIndex, nodeMap]);



  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('graphExplorerSettings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (error) {
      }
    }
  }, []);

  // Save settings to localStorage when changed
  const handleSettingsChange = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    localStorage.setItem('graphExplorerSettings', JSON.stringify(newSettings));
  }, []);

  // URL state serialization/deserialization
  const serializeStateToURL = useCallback(() => {
    const state = {
      view: currentView,
      selectedNodeType,
      selectedEdgeType,
      currentQuery,
      activeFilters,
      pendingFilters,
      showAttributesFor
    };
    
    const encoded = btoa(JSON.stringify(state));
    const url = new URL(window.location.href);
    url.searchParams.set('state', encoded);
    
    return url.toString();
  }, [currentView, selectedNodeType, selectedEdgeType, currentQuery, activeFilters, pendingFilters, showAttributesFor]);

  const copyStateToClipboard = useCallback(async () => {
    const url = serializeStateToURL();
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch (err) {
      return false;
    }
  }, [serializeStateToURL]);

  // Navigation helper declared later (after findConnectedNodes)
  let updateViewForPath: (path: string[]) => Promise<void>;

  // Load graph data
  useEffect(() => {
    
    fetch('/MC1_graph.json')
      .then(response => {
        return response.json();
      })
      .then(data => {
        setGraphData(data);
        setLoading(false);
      })
      .catch(error => {
        setLoading(false);
      });
  }, []);

  // Hydrate state from URL query parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stateParam = params.get('state');
    
    if (stateParam) {
      try {
        const decoded = JSON.parse(atob(stateParam));
        
        if (decoded.view) setCurrentView(decoded.view);
        if (decoded.selectedNodeType) setSelectedNodeType(decoded.selectedNodeType);
        if (decoded.selectedEdgeType) setSelectedEdgeType(decoded.selectedEdgeType);
        if (decoded.currentQuery) setCurrentQuery(decoded.currentQuery);
        if (decoded.activeFilters) setActiveFilters(decoded.activeFilters);
        if (decoded.pendingFilters) setPendingFilters(decoded.pendingFilters);
        if (decoded.showAttributesFor) setShowAttributesFor(decoded.showAttributesFor);
        
        window.history.replaceState({}, '', window.location.pathname);
      } catch (err) {
      }
    }
  }, []);

  // Load edge type summary via Cypher when enabled
  useEffect(() => {
    const run = async () => {
      if (!cypherEnabled) { setEdgeTypeSummaryCypher([]); return; }
      if (currentView !== 'edgeTypes' || !selectedNodeType) { setEdgeTypeSummaryCypher([]); return; }
      try {
        const result = await CypherService.edgeTypesForNodeType(selectedNodeType, activeFilters);
        setEdgeTypeSummaryCypher(result);
      } catch (e) {
        setEdgeTypeSummaryCypher([]);
      }
    };
    run();
  }, [cypherEnabled, currentView, selectedNodeType, activeFilters]);

  // Load node type summary via Cypher when enabled (nodeTypes view)
  useEffect(() => {
    const run = async () => {
      if (!cypherEnabled) { setNodeTypeSummaryCypher([]); return; }
      if (currentView !== 'nodeTypes') { setNodeTypeSummaryCypher([]); return; }
      try {
        const summary = await CypherService.nodeTypeSummary(currentQuery, activeFilters);
        const mapped: NodeTypeSummary[] = summary.map(s => ({ type: s.type, count: s.count as number, examples: [] as GraphNode[] }));
        setNodeTypeSummaryCypher(mapped);
      } catch (e) {
        setNodeTypeSummaryCypher([]);
      }
    };
    run();
  }, [cypherEnabled, currentView, currentQuery, activeFilters]);

  // Load current edges via Cypher (specificNodes + selectedEdgeType)
  useEffect(() => {
    const run = async () => {
      if (!cypherEnabled) { setCurrentEdgesCypher([]); return; }
      if (currentView === 'specificNodes' && selectedEdgeType) {
        try {
          const edges = await CypherService.edgesByType(selectedEdgeType);
          setCurrentEdgesCypher(edges);
        } catch (e) {
          setCurrentEdgesCypher([]);
        }
      } else {
        setCurrentEdgesCypher([]);
      }
    };
    run();
  }, [cypherEnabled, currentView, selectedEdgeType]);



  // NEW: Filter application utilities (moved up to resolve declaration order)
  const applyFiltersToNodes = useCallback((nodes: GraphNode[], filters: Filter[]) => {
    if (!filters || filters.length === 0) return nodes;
    
    
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
    
    return filtered;
  }, []);

  const applyFiltersToEdges = useCallback((edges: GraphLink[], filters: Filter[]) => {
    if (!filters || filters.length === 0) return edges;
    
    
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
    
    return filtered;
  }, []);

  // NEW: Apply cascading filters through the entire query path
  const applyCascadingFilters = useCallback((nodes: GraphNode[], queryPath: string[]) => {
    if (!queryPath || queryPath.length === 0) return nodes;
    
    let filteredNodes = [...nodes];
    
    // Walk through the query path and apply filters progressively
    for (let stepIndex = 0; stepIndex < queryPath.length; stepIndex++) {
      const stepContext = queryPath[stepIndex];
      
      // Get all filters for this step
      const stepFilters = activeFilters.nodeFilters.filter((filter: Filter) => 
        filter.queryStep === stepIndex && filter.queryContext === stepContext
      );
      
      if (stepFilters.length > 0) {
        filteredNodes = applyFiltersToNodes(filteredNodes, stepFilters);
      }
    }
    
    return filteredNodes;
  }, [activeFilters.nodeFilters, applyFiltersToNodes]);


  // OPTIMIZED: Enhanced function to find nodes connected through edge type with cascading filter support
  const findConnectedNodes = useCallback((fromNodeType: string, edgeType: string, baseNodes: GraphNode[] | null = null) => {
    if (cypherEnabled) {
      // defer to cypher in click handler
      return [] as GraphNode[];
    }
    if (!graphData) return [];
    
    
    // Use base nodes if provided (for maintaining filters), otherwise use all nodes of type
    let sourceNodes = baseNodes 
      ? baseNodes.filter((node: GraphNode) => node['Node Type'] === fromNodeType)
      : graphData.nodes.filter((node: GraphNode) => node['Node Type'] === fromNodeType);
    
    // Apply cascading filters to source nodes if no baseNodes provided
    if (!baseNodes && currentQuery.length > 0) {
      sourceNodes = applyCascadingFilters(sourceNodes, currentQuery);
    }
    
    const sourceNodeIds = new Set(sourceNodes.map(node => node.id));
    
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
    
    
    return result;
  }, [cypherEnabled, graphData, edgeIndex, applyCascadingFilters, currentQuery]);

  // Now define updateViewForPath with access to findConnectedNodes
  updateViewForPath = useCallback(async (path: string[]) => {
    if (!path || path.length === 0) {
      setSelectedNodeType(null);
      setSelectedEdgeType(null);
      setCurrentView('nodeTypes');
      setFilteredNodes([]);
      setShowAttributesFor('nodes');
      return;
    }
    if (path.length === 1) {
      const nodeType = path[0];
      setSelectedNodeType(nodeType);
      setSelectedEdgeType(null);
      setCurrentView('edgeTypes');
      setFilteredNodes([]);
      setShowAttributesFor('nodes');
      return;
    }
    if (path.length >= 2) {
      const nodeType = path[0];
      const edgeType = path[1];
      setSelectedNodeType(nodeType);
      setSelectedEdgeType(edgeType);
      setCurrentView('specificNodes');
      setShowAttributesFor('edges');
      try {
        if (cypherEnabled) {
          const nodes = await CypherService.connectedNodes([nodeType, edgeType], activeFilters);
          setFilteredNodes(nodes);
        } else {
          const nodes = findConnectedNodes(nodeType, edgeType);
          setFilteredNodes(nodes);
        }
      } catch (e) {
        const nodes = findConnectedNodes(nodeType, edgeType);
        setFilteredNodes(nodes);
      }
      return;
    }
  }, [cypherEnabled, activeFilters, findConnectedNodes]);

     // Handle node type selection with context preservation
   const handleNodeTypeClick = useCallback((nodeType: string) => {
     const d = deriveRef.current;
     if (d.active && d.method === 'path') {
       setDeriveBuilder(prev => {
         const nextPath = [...prev.path];
         const lastIsEdge = nextPath.length > 0 && (nextPath.length % 2 === 0);
         // If no start type set, seed with node
         if (nextPath.length === 0) {
           nextPath.push(nodeType);
           return { ...prev, startType: nodeType, path: nextPath, stage: prev.stage || 'subquery' };
         }
         // Only add node after an edge
         if (lastIsEdge) {
           nextPath.push(nodeType);
         } else {
         }
         return { ...prev, path: nextPath };
       });
     }
     
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
       // Check if this node type has any outgoing edges (is it a leaf type?)
       const nodesOfType = filteredNodes.filter((n: GraphNode) => n['Node Type'] === nodeType);
       const hasOutgoingEdges = nodesOfType.some((node: GraphNode) => {
         const outgoing = edgeIndex.bySource?.get(node.id) || [];
         return outgoing.length > 0;
       });
       
       if (!hasOutgoingEdges) {
         // Leaf nodes - filter to this type and stay in specificNodes view for table display
         setFilteredNodes(nodesOfType);
         setSelectedNodeType(nodeType);
         // Don't change view - let table view render
       } else {
         // Has edges - navigate to explore them
         setSelectedNodeType(nodeType);
         setSelectedEdgeType(null);
         setCurrentQuery([...currentQuery, nodeType]); // Append instead of replace
         setCurrentView('edgeTypes');
         setFilteredNodes([]);
       }
     } else {
       // Normal navigation from nodeTypes view
       setSelectedNodeType(nodeType);
       setSelectedEdgeType(null);
       setCurrentQuery([nodeType]);
       setCurrentView('edgeTypes');
       setFilteredNodes([]);
     }
     
   }, [currentView, selectedNodeType, selectedEdgeType, currentQuery, filteredNodes]);

     // Handle edge type selection with recursive capability
   const handleEdgeTypeClick = useCallback((edgeType: string) => {
     const d = deriveRef.current;
     if (d.active && d.method === 'path') {
       setDeriveBuilder(prev => {
         const nextPath = [...prev.path];
         const lastIsNode = nextPath.length > 0 && (nextPath.length % 2 === 1);
         if (lastIsNode) {
           nextPath.push(edgeType);
         } else {
         }
         return { ...prev, path: nextPath };
       });
     }
     
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
       return;
     }
     if (cypherEnabled) {
       // Use Cypher backend to load connected nodes asynchronously
       (async () => {
         try {
           const nodes = await CypherService.connectedNodes([selectedNodeType, edgeType], activeFilters);
           setFilteredNodes(nodes);
         } catch (e) {
           const connectedNodes = findConnectedNodes(selectedNodeType, edgeType, baseContext);
           setFilteredNodes(connectedNodes);
         }
       })();
     } else {
       const connectedNodes = findConnectedNodes(selectedNodeType, edgeType, baseContext);
       setFilteredNodes(connectedNodes);
     }
     
   }, [cypherEnabled, currentView, selectedNodeType, currentQuery, filteredNodes, findConnectedNodes, activeFilters]);

     // Handle clicking on query pills for navigation
   const handleNavigateToQueryIndex = useCallback((clickedIndex: number) => {
     
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
       setSelectedNodeType(nodeType);
       setSelectedEdgeType(edgeType);
       setCurrentQuery([nodeType, edgeType]);
       setCurrentView('specificNodes');
       setShowAttributesFor('edges'); // Show edge attributes when navigating to an edge
       if (cypherEnabled) {
         (async () => {
           try {
             const nodes = await CypherService.connectedNodes([nodeType, edgeType], activeFilters);
             setFilteredNodes(nodes);
           } catch (e) {
             const connectedNodes = findConnectedNodes(nodeType, edgeType);
             setFilteredNodes(connectedNodes);
           }
         })();
       } else {
         const connectedNodes = findConnectedNodes(nodeType, edgeType);
         setFilteredNodes(connectedNodes);
       }
     }
     
     // Clear query history since we're jumping to a specific state
     setQueryHistory([]);
     
   }, [cypherEnabled, currentQuery, findConnectedNodes, activeFilters]);

     // Handle query reset
  const resetQuery = useCallback(() => {
    setCurrentQuery([]);
    setQueryHistory([]);
    setSelectedNodeType(null);
    setSelectedEdgeType(null);
    setCurrentView('nodeTypes');
    setFilteredNodes([]);
    setShowAttributesFor('nodes'); // Default to showing node attributes
    // Also clear all filters so future navigation starts clean
    setActiveFilters({ nodeFilters: [], edgeFilters: [] });
    setPendingFilters({ nodeFilters: [], edgeFilters: [] });
  }, []);

   // Handle back navigation
   const handleBackClick = useCallback(() => {
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


  // Build subquery results per start node using forward traversal
  const buildSubqueryResults = useCallback((startType: string, path: string[], endFilters: Filter[]) => {
    const results = new Map<string, GraphNode[]>();
    if (!graphData) return results;
    const startNodes = graphData.nodes.filter(n => n['Node Type'] === startType);
    for (const s of startNodes) {
      let current = new Set<string>([s.id]);
      for (let i = 1; i < path.length; i++) {
        if (i % 2 === 1) {
          // Edge step
          const edgeType = path[i];
          const nextIds = new Set<string>();
          for (const id of current) {
            const se = edgeIndex.bySource.get(id) || [];
            const te = edgeIndex.byTarget.get(id) || [];
            for (const e of [...se, ...te]) {
              if (e['Edge Type'] !== edgeType) continue;
              const other = e.source === id ? e.target : e.source;
              nextIds.add(other);
            }
          }
          current = nextIds;
        } else {
          // Node type step
          const nodeType = path[i];
          const filtered = new Set<string>();
          for (const id of current) {
            const node = nodeMap.get(id);
            if (node && node['Node Type'] === nodeType) filtered.add(id);
          }
          current = filtered;
        }
      }
      // Resolve nodes and apply end filters
      let nodes = Array.from(current).map(id => nodeMap.get(id)).filter(Boolean) as GraphNode[];
      if (nodes.length && endFilters && endFilters.length) {
        nodes = applyFiltersToNodes(nodes, endFilters);
      }
      results.set(s.id, nodes);
    }
    return results;
  }, [graphData, edgeIndex, nodeMap, applyFiltersToNodes]);

  const computeDerivedNumeric = useCallback((name: string, startType: string, path: string[], endFilters: Filter[], op: string, prop?: string, propContext: 'node' | 'edge' = 'node') => {
    if (!graphData) return;
    const results = buildSubqueryResults(startType, path, endFilters);
    const updated = graphData.nodes.map(n => {
      if (n['Node Type'] !== startType) return n;
      const items = results.get(n.id) || [];
      let val: number | null = null;
      if (op === 'count') {
        val = items.length;
      } else if (propContext === 'node') {
        if (op === 'count_distinct' && prop) {
          const set = new Set(items.map(it => String((it as any)[prop])));
          val = set.size;
        } else if (prop) {
          const nums = items.map(it => Number((it as any)[prop])).filter(v => !isNaN(v));
          if (nums.length === 0) val = 0;
          else {
            switch (op) {
              case 'avg': val = nums.reduce((a,b)=>a+b,0)/nums.length; break;
              case 'sum': val = nums.reduce((a,b)=>a+b,0); break;
              case 'min': val = Math.min(...nums); break;
              case 'max': val = Math.max(...nums); break;
            }
          }
        } else {
          val = 0;
        }
      } else {
        // Edge property context — only supported for single-hop paths [N, E, N]
        if (path.length !== 3 || !prop) { val = 0; }
        else {
          const edgeType = path[1];
          const endNodeType = path[2];
          // Build end node set for this start node
          const endNodes = new Set((items as any[]).map(it => it.id));
          const vals: number[] = [];
          const se = edgeIndex.bySource.get(n.id) || [];
          const te = edgeIndex.byTarget.get(n.id) || [];
          [...se, ...te].forEach(e => {
            if (e['Edge Type'] !== edgeType) return;
            const otherId = e.source === n.id ? e.target : e.source;
            if (!endNodes.has(otherId)) return;
            const otherNode = nodeMap.get(otherId);
            if (!otherNode || otherNode['Node Type'] !== endNodeType) return;
            const v = Number((e as any)[prop]);
            if (!isNaN(v)) vals.push(v);
          });
          if (op === 'count_distinct') {
            val = new Set(vals).size;
          } else {
            if (vals.length === 0) val = 0;
            else {
              switch (op) {
                case 'avg': val = vals.reduce((a,b)=>a+b,0)/vals.length; break;
                case 'sum': val = vals.reduce((a,b)=>a+b,0); break;
                case 'min': val = Math.min(...vals); break;
                case 'max': val = Math.max(...vals); break;
                default: val = vals.length;
              }
            }
          }
        }
      }
      return { ...n, [name]: val } as GraphNode;
    });
    setGraphData({ ...graphData, nodes: updated });
  }, [graphData, buildSubqueryResults, edgeIndex, nodeMap]);

  const computeDerivedCategorical = useCallback((name: string, startType: string, path: string[], endFilters: Filter[], op: string, prop?: string, propContext: 'node' | 'edge' = 'node') => {
    if (!graphData) return;
    const results = buildSubqueryResults(startType, path, endFilters);
    const updated = graphData.nodes.map(n => {
      if (n['Node Type'] !== startType) return n;
      const items = results.get(n.id) || [];
      let val: any = null;
      const collectVals = (): string[] => {
        if (propContext === 'node') {
          return items.map(it => String((it as any)[prop!]))
            .filter(v => v !== undefined && v !== 'undefined');
        } else {
          // Edge property context — only supported for single hop
          if (path.length !== 3 || !prop) return [];
          const edgeType = path[1];
          const endNodes = new Set((items as any[]).map(it => it.id));
          const vals: string[] = [];
          const se = edgeIndex.bySource.get(n.id) || [];
          const te = edgeIndex.byTarget.get(n.id) || [];
          [...se, ...te].forEach(e => {
            if (e['Edge Type'] !== edgeType) return;
            const otherId = e.source === n.id ? e.target : e.source;
            if (!endNodes.has(otherId)) return;
            const v = (e as any)[prop!];
            if (v !== undefined && v !== null) vals.push(String(v));
          });
          return vals;
        }
      };
      if (prop) {
        const vals = collectVals();
        if (op === 'most_frequent') {
          const counts = new Map<string, number>();
          vals.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
          let best: string | null = null; let bestC = -1;
          counts.forEach((c, k) => { if (c > bestC) { bestC = c; best = k; } });
          val = best;
        } else if (op === 'single_value') {
          const set = new Set(vals);
          val = set.size === 1 ? Array.from(set)[0] : null;
        } else if (op === 'list_distinct') {
          const set = new Set(vals);
          val = Array.from(set).join(', ');
        }
      }
      return { ...n, [name]: val } as GraphNode;
    });
    setGraphData({ ...graphData, nodes: updated });
  }, [graphData, buildSubqueryResults, edgeIndex]);
  // OPTIMIZED: Memoized edge types with cascading filter support (moved after applyFiltersToNodes)
  // Get the nodes that would be shown in edgeTypes view
  const edgeTypesNodes = useMemo(() => {
    if (currentView !== 'edgeTypes' || !selectedNodeType) return [];
    if (cypherEnabled) return [];

    let targetNodes = graphData?.nodes?.filter(node => node['Node Type'] === selectedNodeType) || [];
    targetNodes = applyCascadingFilters(targetNodes, currentQuery);
    return targetNodes;
  }, [cypherEnabled, currentView, selectedNodeType, graphData, applyCascadingFilters, currentQuery]);

  const memoizedEdgeTypes = useMemo(() => {
    if (currentView !== 'edgeTypes' || !selectedNodeType) return [];
    if (cypherEnabled) return edgeTypeSummaryCypher;

    // Use the computed edgeTypesNodes
    return getConnectedEdgeTypesFromNodes(selectedNodeType, edgeTypesNodes);
  }, [cypherEnabled, edgeTypeSummaryCypher, currentView, selectedNodeType, edgeTypesNodes, getConnectedEdgeTypesFromNodes]);

  // Memoized node type summary with cascading filter support (moved after applyFiltersToNodes)
  const nodeTypeSummary = useMemo(() => {
    if (cypherEnabled && currentView === 'nodeTypes') {
      return nodeTypeSummaryCypher;
    }
    if (!graphData || !graphData.nodes) return [];
    
    
    // Apply cascading filters through the entire query path for treemap view
    let filteredNodes = applyCascadingFilters(graphData.nodes, currentQuery);
    // Apply root per-type filters at root
    if (currentView === 'nodeTypes') {
      const byType = new Map<string, Filter[]>();
      activeFilters.nodeFilters.forEach((f: Filter) => {
        if (f.queryStep === -1 && f.queryContext) {
          if (!byType.has(f.queryContext)) byType.set(f.queryContext, []);
          byType.get(f.queryContext)!.push(f);
        }
      });
      if (byType.size > 0) {
        filteredNodes = filteredNodes.filter((n: GraphNode) => {
          const t = n['Node Type'];
          const filters = byType.get(t);
          if (!filters || filters.length === 0) return true;
          return filters.every((filter: Filter) => {
            const value = (n as any)[filter.attribute];
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
      }
    }
    
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
    
    
    return result;
  }, [cypherEnabled, nodeTypeSummaryCypher, currentView, graphData, applyCascadingFilters, currentQuery, activeFilters.nodeFilters]);

  // NEW: Add/Update/Remove filter functions with query step context
  const addPendingFilter = useCallback((type: keyof PendingFilters, filter: Partial<Filter> | null) => {
    if (!filter) {
      // No-op for clearing from AttributePanel; removal is handled via removePendingFilter
      return;
    }
    // Add query step context to the filter
    const currentQueryStep = currentQuery.length - 1; // Current step index
    const currentQueryContext = currentQuery[currentQueryStep]; // Current node/edge type
    
    // Allow overrides (used by root partition mode)
    const scopedFilter: Filter = {
      ...(filter as Filter),
      queryStep: (filter as any).queryStep !== undefined ? (filter as any).queryStep as number : currentQueryStep,
      queryContext: (filter as any).queryContext !== undefined ? (filter as any).queryContext as string : (currentQueryContext || 'root')
    };
    
    setPendingFilters((prev: PendingFilters) => ({
      ...prev,
      [type]: (prev[type] as Filter[]).filter((f: Filter) => f.attribute !== (filter as Filter).attribute).concat([scopedFilter])
    }));
  }, [currentQuery]);

  const removePendingFilter = useCallback((type: keyof PendingFilters, attribute: string, queryStep: number | null = null, queryContext: string | null = null) => {
    setPendingFilters((prev: PendingFilters) => ({
      ...prev,
      [type]: (prev[type] as Filter[]).filter((f: Filter) => {
        if (queryStep !== null) {
          // Remove filter with specific attribute and query step (and optionally context)
          const match = f.attribute === attribute && f.queryStep === queryStep && (queryContext ? f.queryContext === queryContext : true);
          return !match;
        } else {
          // Remove all filters with this attribute (legacy behavior)
          return f.attribute !== attribute;
        }
      })
    }));
  }, []);

     // NEW: Finalize all pending filters (move them to active)
   const finalizeAllFilters = useCallback(() => {
     
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
     setPendingFilters({
       nodeFilters: [],
       edgeFilters: []
     });
   }, []);

   // NEW: Remove specific active filter by attribute and query step (for deletion from query pills)
  const removeActiveFilter = useCallback((type: keyof ActiveFilters, attribute: string, queryStep: number | null = null, queryContext: string | null = null) => {
    setActiveFilters((prev: ActiveFilters) => ({
      ...prev,
      [type]: (prev[type] as Filter[]).filter((f: Filter) => {
        if (queryStep !== null) {
          // Remove filter with specific attribute and query step (and optionally context)
          const match = f.attribute === attribute && f.queryStep === queryStep && (queryContext ? f.queryContext === queryContext : true);
          return !match;
        } else {
          // Remove all filters with this attribute (legacy behavior)
          return f.attribute !== attribute;
        }
      })
    }));
  }, []);

   const saveFiltersToQuery = useCallback((type: keyof ActiveFilters) => {
     // Note: This is now just for immediate finalization if needed
     finalizeAllFilters();
   }, [finalizeAllFilters]);



  // OPTIMIZED: Get current nodes for attribute analysis with cascading filter support
  const getCurrentNodes = useMemo<GraphNode[]>(() => {
    
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
    // Apply root per-type filters at the root view
    if (currentView === 'nodeTypes') {
      // Group filters by type (queryStep -1)
      const byType = new Map<string, Filter[]>();
      activeFilters.nodeFilters.forEach((f: Filter) => {
        if (f.queryStep === -1 && f.queryContext) {
          if (!byType.has(f.queryContext)) byType.set(f.queryContext, []);
          byType.get(f.queryContext)!.push(f);
        }
      });
      if (byType.size > 0) {
        result = result.filter((n: GraphNode) => {
          const t = n['Node Type'];
          const filters = byType.get(t);
          if (!filters || filters.length === 0) return true;
          return filters.every((filter: Filter) => {
            const value = (n as any)[filter.attribute];
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
      }
    }
    
    return result;
  }, [currentView, selectedNodeType, filteredNodes, graphData, applyCascadingFilters, currentQuery, activeFilters.nodeFilters]);

  // OPTIMIZED: Get current edges using index with cascading filter support
  const getCurrentEdges = useMemo<GraphLink[]>(() => {
    
    if (!graphData || !graphData.links) {
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
      if (cypherEnabled) {
        result = currentEdgesCypher;
      } else {
        result = graphData.links.filter(link => link['Edge Type'] === selectedEdgeType);
      }
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
    
    return result;
  }, [cypherEnabled, currentEdgesCypher, currentView, selectedNodeType, selectedEdgeType, graphData, edgeIndex, activeFilters.edgeFilters, applyFiltersToEdges, applyCascadingFilters, currentQuery]);

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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm font-mono text-vercel-black">Loading graph data...</div>
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm font-mono text-vercel-black">Error loading graph data</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-vercel-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-2">
            <h1 className="text-xl font-mono font-semibold text-vercel-black tracking-tight">
              Aggregated Graph Explorer
            </h1>
            <div className="flex items-center gap-4">
              <div className="text-xs font-mono text-vercel-gray">
                {graphData.nodes?.length || 0} nodes · {graphData.links?.length || 0} edges
              </div>
              <div className="text-xs font-mono text-vercel-light-gray">
                Cache: {edgeTypeCache.size}
              </div>
              <button
                onClick={() => setShowSavedQueries(!showSavedQueries)}
                className="p-2 text-vercel-gray hover:text-vercel-black transition-colors relative"
                title="Saved Queries"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                {savedQueries.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-black text-red-500 text-xs font-mono rounded-full w-5 h-5 flex items-center justify-center">
                    {savedQueries.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 text-vercel-gray hover:text-vercel-black transition-colors"
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


      {/* Query Builder */}
      <QueryBuilder 
        currentQuery={currentQuery}
        onQueryChange={(q: string[]) => {
          setCurrentQuery(q);
          updateViewForPath(q);
        }}
        onReset={resetQuery}
        onSave={saveCurrentQuery}
        onToggleSavedQueries={() => setShowSavedQueries(!showSavedQueries)}
        onNavigateToQueryIndex={handleNavigateToQueryIndex}
        onCopyURL={copyStateToClipboard}
        activeFilters={activeFilters}
        onRemoveFilter={removeActiveFilter}
        deriveStartType={deriveBuilder.active ? deriveBuilder.startType : null}
      />

      {/* Pending Filters Display */}
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
      </div>

      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex gap-4 h-[calc(100vh-140px)] relative">
          {/* Left Side - Contextual Attributes Panel (Full Height) */}
          <div className="w-80 flex-shrink-0 h-full overflow-y-auto relative">
            {/* Derive New Attribute Controls (Two-step) */}
            {deriveBuilder.active && (
            <div className="p-3 border-b border-vercel-border bg-white sticky top-0 z-10">
                <div className="space-y-2">
                  {/* Step 1: Subquery builder → Finalize */}
                  {deriveBuilder.stage !== 'measure' && (
                    <div className="text-xs font-mono text-vercel-black">
                      <div className="font-medium">Building a subquery for each {deriveBuilder.startType || selectedNodeType || 'node'}...</div>
                      <div className="mt-1"><span className="text-vercel-gray">Path:</span> {deriveBuilder.path.length>0?deriveBuilder.path.join(' → '): (selectedNodeType ? 'Click an edge, then a node...' : 'Click a node type, then an edge, then a node...')}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={()=>{ setDeriveBuilder(prev=>({...prev, stage:'measure'})); }} disabled={deriveBuilder.path.length<1} className="px-3 py-1.5 text-xs font-mono rounded border border-vercel-black bg-vercel-black text-white hover:bg-vercel-gray disabled:opacity-30 transition-colors">Finalize Subquery</button>
                        <button onClick={()=>setDeriveBuilder(prev=>({...prev, path:[], startType:selectedNodeType||null}))} className="px-3 py-1.5 text-xs font-mono rounded border border-vercel-border bg-white text-vercel-black hover:bg-vercel-bg transition-colors">Clear Path</button>
                        <button onClick={()=>setDeriveBuilder({ active:false, stage:null, method:null, name:'', path:[], startType:null, measureType:null, measureOp:null, measureProp:null, measurePropContext:null })} className="px-3 py-1.5 text-xs font-mono rounded border border-vercel-border bg-white text-vercel-black hover:bg-vercel-bg transition-colors">Cancel</button>
                      </div>
                    </div>
                  )}

                  {deriveBuilder.stage === 'measure' && (
                    <>
                      <div className="text-xs font-mono text-vercel-gray mb-2">
                        Subquery: <span className="text-vercel-black">{deriveBuilder.path.join(' → ')}</span>
                      </div>
                      
                      <DeriveAttributePanel
                        deriveBuilder={deriveBuilder}
                        setDeriveBuilder={setDeriveBuilder}
                        selectedNodeType={selectedNodeType}
                        graphData={graphData}
                        currentQuery={currentQuery}
                        activeFilters={activeFilters}
                        computeDerivedBoolean={computeDerivedBoolean}
                        computeDerivedNumeric={computeDerivedNumeric}
                        computeDerivedCategorical={computeDerivedCategorical}
                        setGraphData={setGraphData}
                        onComplete={() => {
                          // Navigate back to original state
                          if (deriveBuilder.originalQuery) {
                            setCurrentQuery([...deriveBuilder.originalQuery]);
                            setCurrentView(deriveBuilder.originalView || 'nodeTypes');
                            setSelectedNodeType(deriveBuilder.originalSelectedNodeType || null);
                            setSelectedEdgeType(deriveBuilder.originalSelectedEdgeType || null);
                            setFilteredNodes([...(deriveBuilder.originalFilteredNodes || [])]);
                          }
                        }}
                      />

                    <div className="text-xs font-mono text-vercel-black space-y-2">
                      <div className="text-vercel-gray font-semibold">Visual Builder</div>
                      <div className="flex items-center gap-2">
                        <input type="text" value={deriveBuilder.name} onChange={(e)=>setDeriveBuilder(prev=>({...prev, name:e.target.value}))} placeholder="Attribute name" className="px-2 py-1 text-xs font-mono border border-vercel-border rounded focus:outline-none focus:border-vercel-black" />
                        <button onClick={()=>setDeriveBuilder({ active:false, stage:null, method:null, name:'', path:[], startType:null, measureType:null, measureOp:null, measureProp:null, measurePropContext:null })} className="px-2 py-1 text-xs font-mono rounded border border-vercel-border bg-white text-vercel-black hover:bg-vercel-bg transition-colors">Cancel</button>
                      </div>
                      <div className="font-medium">What kind of attribute?</div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1 text-xs"><input type="radio" name="measureType" checked={deriveBuilder.measureType==='boolean'} onChange={()=>setDeriveBuilder(prev=>({...prev, measureType:'boolean', measureOp:'exists'}))}/> True/False</label>
                        <label className="inline-flex items-center gap-1 text-xs"><input type="radio" name="measureType" checked={deriveBuilder.measureType==='numeric'} onChange={()=>setDeriveBuilder(prev=>({...prev, measureType:'numeric', measureOp:'count'}))}/> Number</label>
                        <label className="inline-flex items-center gap-1 text-xs"><input type="radio" name="measureType" checked={deriveBuilder.measureType==='categorical'} onChange={()=>setDeriveBuilder(prev=>({...prev, measureType:'categorical', measureOp:'most_frequent'}))}/> Category/Text</label>
                      </div>

                      {deriveBuilder.measureType === 'boolean' && (
                        <div className="space-y-2">
                          <div>The new attribute will be True if the subquery...</div>
                          <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1 text-xs"><input type="radio" name="boolOp" checked={deriveBuilder.measureOp==='exists'} onChange={()=>setDeriveBuilder(prev=>({...prev, measureOp:'exists'}))}/> Finds at least one match</label>
                            <label className="inline-flex items-center gap-1 text-xs"><input type="radio" name="boolOp" checked={deriveBuilder.measureOp==='not_exists'} onChange={()=>setDeriveBuilder(prev=>({...prev, measureOp:'not_exists'}))}/> Finds no matches</label>
                          </div>
                          <div className="pt-1">
                            <button className="px-3 py-1.5 text-xs font-mono rounded border border-vercel-black bg-vercel-black text-white hover:bg-vercel-gray disabled:opacity-30 transition-colors" disabled={!deriveBuilder.name || !deriveBuilder.startType || deriveBuilder.path.length<3} onClick={()=>{
                              if (!deriveBuilder.startType) return;
                              const currentStep = currentQuery.length - 1;
                              const endContext = deriveBuilder.path[deriveBuilder.path.length - 1];
                              const endFilters = activeFilters.nodeFilters.filter(f => f.queryStep === currentStep && f.queryContext === endContext);
                              if (deriveBuilder.measureOp==='exists') {
                                computeDerivedBoolean(deriveBuilder.name, deriveBuilder.startType, deriveBuilder.path, endFilters);
                              } else {
                                computeDerivedBoolean('__tmp_exists__', deriveBuilder.startType, deriveBuilder.path, endFilters);
                                setGraphData(prev=>{
                                  if (!prev) return prev;
                                  const updated = prev.nodes.map(n=>{
                                    if (n['Node Type']!==deriveBuilder.startType!) return n;
                                    const v = (n as any)['__tmp_exists__'];
                                    const nv = v === undefined ? false : !Boolean(v);
                                    const { ['__tmp_exists__']: _omit, ...rest } = n as any;
                                    return { ...rest, [deriveBuilder.name!]: nv } as GraphNode;
                                  });
                                  return { ...prev, nodes: updated };
                                });
                              }
                              setDeriveBuilder({ active:false, stage:null, method:null, name:'', path:[], startType:null, measureType:null, measureOp:null, measureProp:null, measurePropContext:null });
                            }}>Create Attribute</button>
                          </div>
                        </div>
                      )}

                      {deriveBuilder.measureType === 'numeric' && (
                        <div className="space-y-2">
                          <div>Calculate a number based on the {deriveBuilder.path[deriveBuilder.path.length-1]} nodes found…</div>
                          <div className="flex flex-wrap gap-2 items-center text-xs">
                            <select className="border rounded px-2 py-1" value={deriveBuilder.measureOp || 'count'} onChange={(e)=>setDeriveBuilder(prev=>({...prev, measureOp:e.target.value }))}>
                              <option value="count">COUNT of</option>
                              <option value="count_distinct">COUNT DISTINCT of</option>
                              <option value="avg">AVERAGE of</option>
                              <option value="sum">SUM of</option>
                              <option value="min">MIN of</option>
                              <option value="max">MAX of</option>
                            </select>
                            {deriveBuilder.measureOp && deriveBuilder.measureOp !== 'count' && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">Property:</span>
                                {(() => {
                                  const endNodeType = deriveBuilder.path[deriveBuilder.path.length-1];
                                  const lastEdgeType = deriveBuilder.path.length >= 3 ? deriveBuilder.path[deriveBuilder.path.length-2] : null;
                                  const nodeProps = Array.from(new Set((graphData?.nodes||[]).filter(n=> n['Node Type']===endNodeType).flatMap(n=> Object.keys(n).filter(k=>k!=='id' && k!=='Node Type')))).slice(0,100);
                                  const edgeProps = lastEdgeType ? Array.from(new Set((graphData?.links||[]).filter(l=> l['Edge Type']===lastEdgeType).flatMap(l=> Object.keys(l).filter(k=>k!=='source' && k!=='target' && k!=='Edge Type')))) : [];
                                  const singleHop = deriveBuilder.path.length === 3;
                                  return (
                                    <div className="flex gap-4">
                                      <div>
                                        <div className="text-[10px] text-gray-500">{endNodeType} (node)</div>
                                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                                          {nodeProps.map(p => (
                                            <button key={`np-num-${p}`} className={`px-1.5 py-0.5 text-[10px] rounded ${deriveBuilder.measureProp===p && deriveBuilder.measurePropContext==='node' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`} onClick={()=>setDeriveBuilder(prev=>({...prev, measureProp:p, measurePropContext:'node'}))}>{p}</button>
                                          ))}
                                        </div>
                                      </div>
                                      {lastEdgeType && (
                                        <div>
                                          <div className="text-[10px] text-gray-500">{lastEdgeType} (edge){!singleHop && ' — multi-hop not supported'}</div>
                                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                                            {edgeProps.map(p => (
                                              <button key={`ep-num-${p}`} disabled={!singleHop} title={!singleHop? 'Edge property measures supported only for single-hop subqueries':''} className={`px-1.5 py-0.5 text-[10px] rounded ${deriveBuilder.measureProp===p && deriveBuilder.measurePropContext==='edge' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'} ${!singleHop ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={()=> singleHop && setDeriveBuilder(prev=>({...prev, measureProp:p, measurePropContext:'edge'}))}>{p}</button>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                          <div className="pt-1">
                            <button className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50" disabled={!deriveBuilder.name || !deriveBuilder.startType || deriveBuilder.path.length<3 || !deriveBuilder.measureOp || (deriveBuilder.measureOp!=='count' && !deriveBuilder.measureProp)} onClick={()=>{
                              if (!deriveBuilder.startType) return;
                              const currentStep = currentQuery.length - 1;
                              const endContext = deriveBuilder.path[deriveBuilder.path.length - 1];
                              const endFilters = activeFilters.nodeFilters.filter(f => f.queryStep === currentStep && f.queryContext === endContext);
                              computeDerivedNumeric(deriveBuilder.name, deriveBuilder.startType, deriveBuilder.path, endFilters, deriveBuilder.measureOp!, deriveBuilder.measureProp || undefined, deriveBuilder.measurePropContext || 'node');
                              setDeriveBuilder({ active:false, stage:null, method:null, name:'', path:[], startType:null, measureType:null, measureOp:null, measureProp:null, measurePropContext:null });
                            }}>Create Attribute</button>
                          </div>
                        </div>
                      )}

                      {deriveBuilder.measureType === 'categorical' && (
                        <div className="space-y-2">
                          <div>Return a text value from the subquery results…</div>
                          <div className="flex items-center gap-2 text-xs">
                            <select className="border rounded px-2 py-1" value={deriveBuilder.measureOp || 'most_frequent'} onChange={(e)=>setDeriveBuilder(prev=>({...prev, measureOp:e.target.value }))}>
                              <option value="most_frequent">The MOST FREQUENT value of</option>
                              <option value="single_value">The value of (single result)</option>
                              <option value="list_distinct">A LIST of distinct values of</option>
                            </select>
                            <div className="flex items-center gap-2">
                              {(() => {
                                const endNodeType = deriveBuilder.path[deriveBuilder.path.length-1];
                                const lastEdgeType = deriveBuilder.path.length >= 3 ? deriveBuilder.path[deriveBuilder.path.length-2] : null;
                                const nodeProps = Array.from(new Set((graphData?.nodes||[]).filter(n=> n['Node Type']===endNodeType).flatMap(n=> Object.keys(n).filter(k=>k!=='id' && k!=='Node Type')))).slice(0,100);
                                const edgeProps = lastEdgeType ? Array.from(new Set((graphData?.links||[]).filter(l=> l['Edge Type']===lastEdgeType).flatMap(l=> Object.keys(l).filter(k=>k!=='source' && k!=='target' && k!=='Edge Type')))) : [];
                                const singleHop = deriveBuilder.path.length === 3;
                                return (
                                  <div className="flex gap-4">
                                    <div>
                                      <div className="text-[10px] font-mono text-vercel-gray">{endNodeType} (node)</div>
                                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                                        {nodeProps.map(p => (
                                          <button key={`np-cat-${p}`} className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${deriveBuilder.measureProp===p && deriveBuilder.measurePropContext==='node' ? 'bg-vercel-black text-white border-vercel-black' : 'bg-white text-vercel-black border-vercel-border hover:bg-vercel-bg'}`} onClick={()=>setDeriveBuilder(prev=>({...prev, measureProp:p, measurePropContext:'node'}))}>{p}</button>
                                        ))}
                                      </div>
                                    </div>
                                    {lastEdgeType && (
                                      <div>
                                        <div className="text-[10px] font-mono text-vercel-gray">{lastEdgeType} (edge){!singleHop && ' — multi-hop not supported'}</div>
                                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                                          {edgeProps.map(p => (
                                            <button key={`ep-cat-${p}`} disabled={!singleHop} title={!singleHop? 'Edge property measures supported only for single-hop subqueries':''} className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${deriveBuilder.measureProp===p && deriveBuilder.measurePropContext==='edge' ? 'bg-vercel-black text-white border-vercel-black' : 'bg-white text-vercel-black border-vercel-border hover:bg-vercel-bg'} ${!singleHop ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={()=> singleHop && setDeriveBuilder(prev=>({...prev, measureProp:p, measurePropContext:'edge'}))}>{p}</button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="pt-1">
                            <button className="px-3 py-1.5 text-xs font-mono rounded border border-vercel-black bg-vercel-black text-white hover:bg-vercel-gray disabled:opacity-30 transition-colors" disabled={!deriveBuilder.name || !deriveBuilder.startType || deriveBuilder.path.length<3 || !deriveBuilder.measureProp} onClick={()=>{
                              if (!deriveBuilder.startType) return;
                              const currentStep = currentQuery.length - 1;
                              const endContext = deriveBuilder.path[deriveBuilder.path.length - 1];
                              const endFilters = activeFilters.nodeFilters.filter(f => f.queryStep === currentStep && f.queryContext === endContext);
                              computeDerivedCategorical(deriveBuilder.name, deriveBuilder.startType, deriveBuilder.path, endFilters, deriveBuilder.measureOp || 'most_frequent', deriveBuilder.measureProp || undefined, deriveBuilder.measurePropContext || 'node');
                              setDeriveBuilder({ active:false, stage:null, method:null, name:'', path:[], startType:null, measureType:null, measureOp:null, measureProp:null, measurePropContext: null });
                            }}>Create Attribute</button>
                          </div>
                        </div>
                      )}
                    </div>
                    </>
                  )}
                </div>
            </div>
            )}
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
                partitionByNodeType={currentView === 'nodeTypes'}
                theme={currentView === 'nodeTypes' ? 'green' : 'blue'}
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
                theme={'green'}
              />
            )}
            
            {/* Derive New Attribute Button - positioned at bottom */}
            {!deriveBuilder.active && (
              <div className="p-3 border-t border-vercel-border bg-white">
                <button
                  onClick={() => {
                    const initialPath = selectedNodeType ? [selectedNodeType] : [];
                    setDeriveBuilder({ 
                      active: true, 
                      stage: 'subquery', 
                      method: 'path', 
                      name: '', 
                      path: initialPath, 
                      startType: selectedNodeType, 
                      measureType: null, 
                      measureOp: null, 
                      measureProp: null, 
                      measurePropContext: null,
                      // Store original state to restore after derivation
                      originalQuery: [...currentQuery],
                      originalView: currentView,
                      originalSelectedNodeType: selectedNodeType,
                      originalSelectedEdgeType: selectedEdgeType,
                      originalFilteredNodes: [...filteredNodes]
                    });
                  }}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded bg-vercel-black text-white hover:bg-vercel-gray transition-colors inline-flex items-center justify-center gap-2"
                  title="Derive a new attribute"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6"/></svg>
                  Derive New Attribute
                </button>
              </div>
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
              filteredNodes={currentView === 'edgeTypes' ? edgeTypesNodes : filteredNodes}
              onNodeTypeClick={handleNodeTypeClick}
              onEdgeTypeClick={handleEdgeTypeClick}
              onBackClick={handleBackClick}
              settings={settings}
              isCalculating={isCalculating}
              calculationProgress={calculationProgress}
              edgeIndex={edgeIndex}
            />
          </div>

          {/* Right Side - Pop-out Panels */}
          {/* Right Slide-out: Saved Queries Panel */}
          <div
            className={`fixed right-0 top-0 h-full w-96 z-50 transform transition-transform duration-300 ${showSavedQueries ? 'translate-x-0' : 'translate-x-full'}`}
          >
            <div className="h-full bg-white border-l border-vercel-border shadow-sm">
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
              className="fixed inset-0 bg-vercel-black bg-opacity-20 z-40"
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
