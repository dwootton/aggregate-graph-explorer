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
};

/**
 * Parse an expression like "COUNT(Song)", "AVG(Person.age)", "COUNT_DISTINCT(Song.name)"
 */
export function parseExpression(expr: string): ParsedExpression | null {
  // Remove whitespace
  const trimmed = expr.trim();
  
  // Match pattern: FUNCTION(EntityType.property) or FUNCTION(EntityType)
  const match = trimmed.match(/^([A-Z_]+)\(([^)]+)\)$/);
  
  if (!match) {
    return null;
  }
  
  const [, func, arg] = match;
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
  filters: Filter[]
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
  
  try {
    const func = parsed.function.toUpperCase();
    
    switch (func) {
      case 'COUNT':
        return executeCount(startType, path, graphData, filters, false);
      
      case 'COUNT_DISTINCT':
        if (!parsed.property) {
          return { success: false, error: 'COUNT_DISTINCT requires a property (e.g., COUNT_DISTINCT(Song.name))' };
        }
        return executeCountDistinct(startType, path, graphData, filters, parsed.property);
      
      case 'AVG':
        if (!parsed.property) {
          return { success: false, error: 'AVG requires a property (e.g., AVG(Person.age))' };
        }
        return executeNumericAgg(startType, path, graphData, filters, parsed.property, 'avg');
      
      case 'SUM':
        if (!parsed.property) {
          return { success: false, error: 'SUM requires a property (e.g., SUM(Album.sales))' };
        }
        return executeNumericAgg(startType, path, graphData, filters, parsed.property, 'sum');
      
      case 'MIN':
        if (!parsed.property) {
          return { success: false, error: 'MIN requires a property (e.g., MIN(Song.duration))' };
        }
        return executeNumericAgg(startType, path, graphData, filters, parsed.property, 'min');
      
      case 'MAX':
        if (!parsed.property) {
          return { success: false, error: 'MAX requires a property (e.g., MAX(Song.duration))' };
        }
        return executeNumericAgg(startType, path, graphData, filters, parsed.property, 'max');
      
      case 'EXISTS':
        return executeExists(startType, path, graphData, filters, false);
      
      case 'NOT_EXISTS':
        return executeExists(startType, path, graphData, filters, true);
      
      case 'MOST_FREQUENT':
        if (!parsed.property) {
          return { success: false, error: 'MOST_FREQUENT requires a property (e.g., MOST_FREQUENT(Genre.name))' };
        }
        return executeMostFrequent(startType, path, graphData, filters, parsed.property);
      
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

function executeCount(
  startType: string,
  path: string[],
  graphData: { nodes: GraphNode[]; links: GraphLink[] },
  filters: Filter[],
  distinct: boolean
): ExpressionResult {
  const results = traversePath(startType, path, graphData, filters);
  
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
  property: string
): ExpressionResult {
  const results = traversePath(startType, path, graphData, filters);
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
  op: 'avg' | 'sum' | 'min' | 'max'
): ExpressionResult {
  const results = traversePath(startType, path, graphData, filters);
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
  negate: boolean
): ExpressionResult {
  const results = traversePath(startType, path, graphData, filters);
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
  property: string
): ExpressionResult {
  const results = traversePath(startType, path, graphData, filters);
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
  filters: Filter[]
): (GraphNode | GraphLink)[] {
  // Start with all nodes of the starting type
  let currentItems: (GraphNode | GraphLink)[] = graphData.nodes.filter(
    n => n['Node Type'] === startType
  );
  
  // Traverse the path
  for (let i = 1; i < path.length; i++) {
    const step = path[i];
    const isEdgeStep = i % 2 === 1;
    
    if (isEdgeStep) {
      // Edge step: find edges of this type connected to current nodes
      const edgeType = step;
      const nodeIds = new Set(currentItems.map(n => (n as GraphNode).id));
      currentItems = graphData.links.filter(
        e => e.type === edgeType && (nodeIds.has(e.source) || nodeIds.has(e.target))
      );
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
    }
  }
  
  // Apply filters to final results
  return applyFilters(currentItems, filters);
}

function applyFilters(
  items: (GraphNode | GraphLink)[],
  filters: Filter[]
): (GraphNode | GraphLink)[] {
  return items.filter(item => {
    return filters.every(filter => {
      const value = (item as any)[filter.attribute];
      
      switch (filter.type) {
        case 'range':
          return value >= filter.min! && value <= filter.max!;
        case 'categorical':
          return filter.values?.includes(value);
        case 'search':
          return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
        default:
          return true;
      }
    });
  });
}
