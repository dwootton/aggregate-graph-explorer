import { GraphNode, GraphLink, Filter } from '../types';

type ExpressionResult = {
  success: boolean;
  value?: any;
  error?: string;
};

type ParsedExpression = {
  function: string;
  attribute?: string;
  entityType?: string;
  property?: string;
  filter?: {
    property: string;
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
    value: any;
  };
};

/**
 * Parse an expression like "COUNT(Song)", "AVG(Person.age)", "COUNT_DISTINCT(Song.name)", "COUNT(Song.single==True)"
 */
export function parseExpression(expr: string): ParsedExpression | null {
  // Remove whitespace
  const trimmed = expr.trim();
  console.log('[parseExpression] Input:', expr);
  
  // Match pattern: FUNCTION(EntityType.property) or FUNCTION(EntityType)
  const match = trimmed.match(/^([A-Z_]+)\(([^)]+)\)$/);
  
  if (!match) {
    console.log('[parseExpression] No function match');
    return null;
  }
  
  const [, func, arg] = match;
  console.log('[parseExpression] Function:', func, 'Arg:', arg);
  
  // Check for filter condition (e.g., Song.single==True or Song.duration>120)
  const filterMatch = arg.match(/^([^=!<>]+)(==|!=|>=|<=|>|<)(.+)$/);
  
  if (filterMatch) {
    console.log('[parseExpression] Filter match found:', filterMatch);
    const [, leftSide, operator, rightValue] = filterMatch;
    const parts = leftSide.trim().split('.');
    
    if (parts.length === 1) {
      // EntityType with filter, like COUNT(Song==value) - not valid, needs property
      return null;
    } else if (parts.length === 2) {
      // Entity.property with filter, like COUNT(Song.single==True)
      let value: any = rightValue.trim();
      
      // Parse value type
      if (value === 'True' || value === 'true') {
        value = true;
      } else if (value === 'False' || value === 'false') {
        value = false;
      } else if (value === 'null' || value === 'None') {
        value = null;
      } else if (!isNaN(Number(value))) {
        value = Number(value);
      } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      const result = {
        function: func,
        entityType: parts[0],
        property: parts[1],
        attribute: leftSide.trim(),
        filter: {
          property: parts[1],
          operator: operator as '==' | '!=' | '>' | '<' | '>=' | '<=',
          value
        }
      };
      console.log('[parseExpression] Parsed with filter:', result);
      return result;
    }
    
    return null;
  }
  
  // No filter - original parsing logic
  const parts = arg.split('.');
  
  if (parts.length === 1) {
    // Just entity type, like COUNT(Song)
    return {
      function: func,
      entityType: parts[0]
    };
  } else if (parts.length === 2) {
    // Entity.property, like AVG(Person.age)
    return {
      function: func,
      entityType: parts[0],
      property: parts[1],
      attribute: arg
    };
  }
  
  return null;
}

/**
 * Execute an expression against a subquery result
 */
export function executeExpression(
  expression: string,
  startType: string,
  path: string[],
  graphData: { nodes: GraphNode[]; links: GraphLink[] },
  filters: Filter[],
  startNodeId?: string
): ExpressionResult {
  const parsed = parseExpression(expression);
  
  if (!parsed) {
    return {
      success: false,
      error: `Could not parse expression: ${expression}`
    };
  }
  
  // Get the target entity type (last item in path)
  const targetType = path[path.length - 1];
  const isTargetNode = path.length % 2 === 1;
  
  // Validate entity type matches
  if (parsed.entityType !== targetType) {
    return {
      success: false,
      error: `Entity type mismatch: expression uses ${parsed.entityType}, but path ends with ${targetType}`
    };
  }
  
  // Convert inline filter to Filter object if present
  const allFilters = [...filters];
  if (parsed.filter) {
    let filterObj: Filter;
    
    if (typeof parsed.filter.value === 'boolean') {
      filterObj = {
        attribute: parsed.filter.property,
        type: 'categorical' as const,
        queryStep: 0,
        queryContext: targetType,
        values: [String(parsed.filter.value)]
      };
    } else if (typeof parsed.filter.value === 'string') {
      filterObj = {
        attribute: parsed.filter.property,
        type: 'categorical' as const,
        queryStep: 0,
        queryContext: targetType,
        values: [parsed.filter.value]
      };
    } else {
      filterObj = {
        attribute: parsed.filter.property,
        type: 'range' as const,
        queryStep: 0,
        queryContext: targetType,
        ...getFilterRange(parsed.filter.operator, parsed.filter.value)
      };
    }
    
    console.log('[executeExpression] Adding inline filter:', filterObj);
    allFilters.push(filterObj);
  }
  console.log('[executeExpression] All filters:', allFilters);
  
  try {
    const func = parsed.function.toUpperCase();
    
    switch (func) {
      case 'COUNT':
        return executeCount(startType, path, graphData, allFilters, false, startNodeId);
      
      case 'COUNT_DISTINCT':
        if (!parsed.property) {
          return { success: false, error: 'COUNT_DISTINCT requires a property (e.g., COUNT_DISTINCT(Song.name))' };
        }
        return executeCountDistinct(startType, path, graphData, allFilters, parsed.property, startNodeId);
      
      case 'AVG':
        if (!parsed.property) {
          return { success: false, error: 'AVG requires a property (e.g., AVG(Person.age))' };
        }
        return executeNumericAgg(startType, path, graphData, allFilters, parsed.property, 'avg', startNodeId);
      
      case 'SUM':
        if (!parsed.property) {
          return { success: false, error: 'SUM requires a property (e.g., SUM(Album.sales))' };
        }
        return executeNumericAgg(startType, path, graphData, allFilters, parsed.property, 'sum', startNodeId);
      
      case 'MIN':
        if (!parsed.property) {
          return { success: false, error: 'MIN requires a property (e.g., MIN(Song.duration))' };
        }
        return executeNumericAgg(startType, path, graphData, allFilters, parsed.property, 'min', startNodeId);
      
      case 'MAX':
        if (!parsed.property) {
          return { success: false, error: 'MAX requires a property (e.g., MAX(Song.duration))' };
        }
        return executeNumericAgg(startType, path, graphData, allFilters, parsed.property, 'max', startNodeId);
      
      case 'EXISTS':
        return executeExists(startType, path, graphData, allFilters, false, startNodeId);
      
      case 'NOT_EXISTS':
        return executeExists(startType, path, graphData, allFilters, true, startNodeId);
      
      case 'MOST_FREQUENT':
        if (!parsed.property) {
          return { success: false, error: 'MOST_FREQUENT requires a property (e.g., MOST_FREQUENT(Genre.name))' };
        }
        return executeMostFrequent(startType, path, graphData, allFilters, parsed.property, startNodeId);
      
      default:
        return {
          success: false,
          error: `Unknown function: ${func}`
        };
    }
  } catch (error) {
    return {
      success: false,
      error: `Execution error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function getFilterRange(operator: string, value: number): { min?: number; max?: number } {
  switch (operator) {
    case '==':
      return { min: value, max: value };
    case '>':
      return { min: value + Number.EPSILON };
    case '>=':
      return { min: value };
    case '<':
      return { max: value - Number.EPSILON };
    case '<=':
      return { max: value };
    default:
      return {};
  }
}

function executeCount(
  startType: string,
  path: string[],
  graphData: { nodes: GraphNode[]; links: GraphLink[] },
  filters: Filter[],
  distinct: boolean,
  startNodeId?: string
): ExpressionResult {
  const results = traversePath(startType, path, graphData, filters, startNodeId);
  
  return {
    success: true,
    value: results.length
  };
}

function executeCountDistinct(
  startType: string,
  path: string[],
  graphData: { nodes: GraphNode[]; links: GraphLink[] },
  filters: Filter[],
  property: string,
  startNodeId?: string
): ExpressionResult {
  const results = traversePath(startType, path, graphData, filters, startNodeId);
  const uniqueValues = new Set(results.map(item => (item as any)[property]));
  
  return {
    success: true,
    value: uniqueValues.size
  };
}

function executeNumericAgg(
  startType: string,
  path: string[],
  graphData: { nodes: GraphNode[]; links: GraphLink[] },
  filters: Filter[],
  property: string,
  op: 'avg' | 'sum' | 'min' | 'max',
  startNodeId?: string
): ExpressionResult {
  const results = traversePath(startType, path, graphData, filters, startNodeId);
  const values = results
    .map(item => (item as any)[property])
    .filter(v => typeof v === 'number' && !isNaN(v));
  
  if (values.length === 0) {
    return { success: true, value: null };
  }
  
  let result: number;
  switch (op) {
    case 'avg':
      result = values.reduce((a, b) => a + b, 0) / values.length;
      break;
    case 'sum':
      result = values.reduce((a, b) => a + b, 0);
      break;
    case 'min':
      result = Math.min(...values);
      break;
    case 'max':
      result = Math.max(...values);
      break;
  }
  
  return { success: true, value: result };
}

function executeExists(
  startType: string,
  path: string[],
  graphData: { nodes: GraphNode[]; links: GraphLink[] },
  filters: Filter[],
  negate: boolean,
  startNodeId?: string
): ExpressionResult {
  const results = traversePath(startType, path, graphData, filters, startNodeId);
  const exists = results.length > 0;
  
  return {
    success: true,
    value: negate ? !exists : exists
  };
}

function executeMostFrequent(
  startType: string,
  path: string[],
  graphData: { nodes: GraphNode[]; links: GraphLink[] },
  filters: Filter[],
  property: string,
  startNodeId?: string
): ExpressionResult {
  const results = traversePath(startType, path, graphData, filters, startNodeId);
  const frequencies = new Map<any, number>();
  
  results.forEach(item => {
    const value = (item as any)[property];
    if (value !== undefined && value !== null) {
      frequencies.set(value, (frequencies.get(value) || 0) + 1);
    }
  });
  
  if (frequencies.size === 0) {
    return { success: true, value: null };
  }
  
  let maxCount = 0;
  let mostFrequent: any = null;
  
  frequencies.forEach((count, value) => {
    if (count > maxCount) {
      maxCount = count;
      mostFrequent = value;
    }
  });
  
  return { success: true, value: mostFrequent };
}

/**
 * Traverse the path and return the final set of nodes/edges
 */
function traversePath(
  startType: string,
  path: string[],
  graphData: { nodes: GraphNode[]; links: GraphLink[] },
  filters: Filter[],
  startNodeId?: string
): (GraphNode | GraphLink)[] {
  console.log('[traversePath] Start:', { startType, path, startNodeId, filterCount: filters.length });
  // Start with all nodes of the starting type (or a specific node if specified)
  let currentItems: (GraphNode | GraphLink)[] = graphData.nodes.filter(
    n => n['Node Type'] === startType && (!startNodeId || n.id === startNodeId)
  );
  console.log('[traversePath] Initial items:', currentItems.length);
  
  // Traverse the path
  for (let i = 1; i < path.length; i++) {
    const step = path[i];
    const isEdgeStep = i % 2 === 1;
    
    if (isEdgeStep) {
      // Edge step: find edges of this type connected to current nodes
      const edgeType = step;
      const nodeIds = new Set(currentItems.map(n => (n as GraphNode).id));
      currentItems = graphData.links.filter(
        e => e['Edge Type'] === edgeType && (nodeIds.has(e.source) || nodeIds.has(e.target))
      );
      console.log('[traversePath] After edge step:', edgeType, 'found', currentItems.length, 'edges');
    } else {
      // Node step: find nodes of this type connected via previous edges
      const nodeType = step;
      const edgeSourceTargets = new Set<string>();
      currentItems.forEach(e => {
        const edge = e as GraphLink;
        edgeSourceTargets.add(edge.source);
        edgeSourceTargets.add(edge.target);
      });
      currentItems = graphData.nodes.filter(
        n => n['Node Type'] === nodeType && edgeSourceTargets.has(n.id)
      );
      console.log('[traversePath] After node step:', nodeType, 'found', currentItems.length, 'nodes');
    }
  }
  
  // Apply filters to final results
  console.log('[traversePath] Before filters:', currentItems.length);
  const filtered = applyFilters(currentItems, filters);
  console.log('[traversePath] After filters:', filtered.length);
  return filtered;
}

function applyFilters(
  items: (GraphNode | GraphLink)[],
  filters: Filter[]
): (GraphNode | GraphLink)[] {
  console.log('[applyFilters] Filtering', items.length, 'items with', filters.length, 'filters');
  return items.filter(item => {
    const passes = filters.every(filter => {
      const value = (item as any)[filter.attribute];
      console.log('[applyFilters] Checking filter:', { attribute: filter.attribute, type: filter.type, itemValue: value, filterValues: filter.values });
      
      switch (filter.type) {
        case 'range':
          if (filter.min !== undefined && value < filter.min) return false;
          if (filter.max !== undefined && value > filter.max) return false;
          return true;
        case 'categorical':
          // Handle boolean and string comparison
          const result = filter.values?.some(filterVal => {
            if (typeof value === 'boolean') {
              // Compare boolean to string representation
              const matches = String(value) === filterVal;
              console.log('[applyFilters] Boolean comparison:', { value, filterVal, stringValue: String(value), matches });
              return matches;
            }
            const matches = String(value) === filterVal;
            console.log('[applyFilters] String comparison:', { value, filterVal, matches });
            return matches;
          }) ?? false;
          console.log('[applyFilters] Categorical result:', result);
          return result;
        case 'search':
          return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
        default:
          return true;
      }
    });
    return passes;
  });
}
