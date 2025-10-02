// Graph Data Types
export interface GraphNode {
  id: string;
  'Node Type': string;
  [key: string]: any; // For dynamic attributes
}

export interface GraphLink {
  source: string;
  target: string;
  'Edge Type': string;
  [key: string]: any; // For dynamic attributes
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Filter Types
export interface Filter {
  attribute: string;
  type: 'range' | 'categorical' | 'search' | 'date_range';
  queryStep: number;
  queryContext: string;
  // Range filter
  min?: number;
  max?: number;
  // Categorical filter
  values?: string[];
  // Search filter
  value?: string;
  // Date range filter
  startDate?: Date;
  endDate?: Date;
}

export interface ActiveFilters {
  nodeFilters: Filter[];
  edgeFilters: Filter[];
}

export interface PendingFilters {
  nodeFilters: Filter[];
  edgeFilters: Filter[];
}

// View Types
export type ViewType = 'nodeTypes' | 'edgeTypes' | 'specificNodes';

// Settings Types
export interface Settings {
  nodeColors: string[];
  edgeColors: string[];
  showConnectors: boolean;
  animateTransitions: boolean;
  customNodeColors: string[];
  customEdgeColors: string[];
  useCustomColors: boolean;
}

// Query History Types
export interface QueryHistoryEntry {
  view: ViewType;
  selectedNodeType: string | null;
  selectedEdgeType: string | null;
  query: string[];
  filteredNodes: GraphNode[];
}

// Saved Query Types
export interface SavedQuery {
  id: number;
  name: string;
  query: string[];
  notes: string;
  timestamp: string;
  // Full application state snapshot to restore later
  state: {
    view: ViewType;
    selectedNodeType: string | null;
    selectedEdgeType: string | null;
    currentQuery: string[];
    filteredNodes: GraphNode[];
    activeFilters: ActiveFilters;
    pendingFilters: PendingFilters;
    showAttributesFor: 'nodes' | 'edges';
  };
}

// Edge Index Types
export interface EdgeIndex {
  bySource: Map<string, GraphLink[]>;
  byTarget: Map<string, GraphLink[]>;
}

// Node Type Summary Types
export interface NodeTypeSummary {
  type: string;
  count: number;
  examples: GraphNode[];
}

// Edge Type Summary Types
export interface EdgeTypeSummary {
  type: string;
  count: number;
  connectedNodeTypes: string[];
}

// Attribute Analysis Types
export interface AttributeAnalysis {
  name: string;
  type: 'numeric' | 'boolean' | 'string' | 'date';
  isNumeric: boolean;
  isBoolean: boolean;
  isDate: boolean;
  isHighCardinality: boolean;
  cardinality: number;
  completeness: number;
  min?: number;
  max?: number;
  mean?: number;
  uniqueValues: string[];
  distribution: { [key: string]: number };
}

// Chart Data Types
export interface ChartData {
  labels: string[];
  values: number[];
  colors?: string[];
}

// Histogram Data Types
export interface HistogramData {
  bins: { start: number; end: number; count: number }[];
  min: number;
  max: number;
}

// Component Props Types
export interface AttributePanelProps {
  data: GraphNode[] | GraphLink[];
  title: string;
  allPendingFilters: PendingFilters;
  onFinalize: () => void;
  onRemoveFilter: (type: 'nodeFilters' | 'edgeFilters', attribute: string) => void;
  onClearAll: () => void;
}

export interface QueryBuilderProps {
  currentQuery: string[];
  onQueryChange: (query: string[]) => void;
  onReset: () => void;
  onSave: () => void;
  onToggleSavedQueries: () => void;
  onNavigateToQueryIndex: (index: number) => void;
  activeFilters: ActiveFilters;
}

export interface TreemapViewProps {
  data: NodeTypeSummary[] | EdgeTypeSummary[];
  onItemClick: (item: NodeTypeSummary | EdgeTypeSummary) => void;
  settings: Settings;
}

export interface SettingsPanelProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onClose: () => void;
}

export interface CustomHistogramProps {
  data: HistogramData;
  attribute: AttributeAnalysis;
  onBrushChange: (min: number, max: number) => void;
  currentFilter?: Filter;
}

export interface CustomBarChartProps {
  data: ChartData;
  attribute: AttributeAnalysis;
  onSelectionChange: (selectedValues: string[]) => void;
  currentFilter?: Filter;
}

export interface CustomSearchProps {
  data: string[];
  attribute: AttributeAnalysis;
  onSelectionChange: (selectedValues: string[]) => void;
  currentFilter?: Filter;
} 
