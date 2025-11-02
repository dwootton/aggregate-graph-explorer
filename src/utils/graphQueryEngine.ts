import { GraphNode, GraphLink, Filter } from '../types';
import { parseExpression } from './expressionParser';

type AdjacencyIndex = {
  nodesByType: Map<string, Set<string>>;
  edgesByType: Map<string, GraphLink[]>;
  edgesFromNode: Map<string, Map<string, GraphLink[]>>;
  edgesToNode: Map<string, Map<string, GraphLink[]>>;
};

type ExecuteOptions = {
  batchSize?: number;
  onProgress?: (percent: number) => void;
};

export class GraphQueryEngine {
  private graphData: { nodes: GraphNode[]; links: GraphLink[] };
  private adjacencyIndex: AdjacencyIndex;

  constructor(graphData: { nodes: GraphNode[]; links: GraphLink[] }) {
    this.graphData = graphData;
    this.adjacencyIndex = this.buildIndices();
  }

  private buildIndices(): AdjacencyIndex {
    const nodesByType = new Map<string, Set<string>>();
    const edgesByType = new Map<string, GraphLink[]>();
    const edgesFromNode = new Map<string, Map<string, GraphLink[]>>();
    const edgesToNode = new Map<string, Map<string, GraphLink[]>>();

    for (const node of this.graphData.nodes) {
      const nodeType = node['Node Type'];
      if (!nodesByType.has(nodeType)) {
        nodesByType.set(nodeType, new Set());
      }
      nodesByType.get(nodeType)!.add(node.id);
    }

    for (const edge of this.graphData.links) {
      const edgeType = edge['Edge Type'];
      
      if (!edgesByType.has(edgeType)) {
        edgesByType.set(edgeType, []);
      }
      edgesByType.get(edgeType)!.push(edge);

      if (!edgesFromNode.has(edge.source)) {
        edgesFromNode.set(edge.source, new Map());
      }
      if (!edgesFromNode.get(edge.source)!.has(edgeType)) {
        edgesFromNode.get(edge.source)!.set(edgeType, []);
      }
      edgesFromNode.get(edge.source)!.get(edgeType)!.push(edge);

      if (!edgesToNode.has(edge.target)) {
        edgesToNode.set(edge.target, new Map());
      }
      if (!edgesToNode.get(edge.target)!.has(edgeType)) {
        edgesToNode.get(edge.target)!.set(edgeType, []);
      }
      edgesToNode.get(edge.target)!.get(edgeType)!.push(edge);
    }

    return { nodesByType, edgesByType, edgesFromNode, edgesToNode };
  }

  public async executeExpression(
    expression: string,
    startType: string,
    path: string[],
    filters: Filter[],
    options: ExecuteOptions = {}
  ): Promise<Map<string, any>> {
    const { batchSize = 100, onProgress } = options;

    const parsed = parseExpression(expression);
    if (!parsed) {
      throw new Error(`Could not parse expression: ${expression}`);
    }

    const targetType = path[path.length - 1];
    if (parsed.entityType !== targetType) {
      throw new Error(`Entity type mismatch: expression uses ${parsed.entityType}, but path ends with ${targetType}`);
    }

    const allFilters = this.prepareFilters(filters, parsed);
    const startNodeIds = this.adjacencyIndex.nodesByType.get(startType) || new Set();
    const startNodes = Array.from(startNodeIds);
    
    const results = new Map<string, any>();

    for (let i = 0; i < startNodes.length; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, startNodes.length);
      
      for (let j = i; j < batchEnd; j++) {
        const nodeId = startNodes[j];
        const result = this.executeForNode(
          expression,
          parsed,
          startType,
          path,
          allFilters,
          nodeId
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Expression execution failed');
        }
        
        results.set(nodeId, result.value);
      }

      if (onProgress) {
        const progress = (batchEnd / startNodes.length) * 100;
        onProgress(progress);
      }

      if (i + batchSize < startNodes.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    return results;
  }

  private prepareFilters(filters: Filter[], parsed: any): Filter[] {
    const allFilters = [...filters];
    
    if (parsed.filter) {
      let filterObj: Filter;
      const targetType = parsed.entityType;
      
      if (typeof parsed.filter.value === 'boolean' || typeof parsed.filter.value === 'string') {
        filterObj = {
          attribute: parsed.filter.property,
          type: 'categorical' as const,
          queryStep: 0,
          queryContext: targetType,
          values: [String(parsed.filter.value)]
        };
      } else {
        filterObj = {
          attribute: parsed.filter.property,
          type: 'range' as const,
          queryStep: 0,
          queryContext: targetType,
          ...this.getFilterRange(parsed.filter.operator, parsed.filter.value)
        };
      }
      
      allFilters.push(filterObj);
    }
    
    return allFilters;
  }

  private getFilterRange(operator: string, value: number): { min?: number; max?: number } {
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

  private executeForNode(
    expression: string,
    parsed: any,
    startType: string,
    path: string[],
    filters: Filter[],
    startNodeId: string
  ): { success: boolean; value?: any; error?: string } {
    const results = this.traversePathOptimized(startType, path, filters, startNodeId);
    
    const func = parsed.function.toUpperCase();
    
    try {
      switch (func) {
        case 'COUNT':
          return { success: true, value: results.length };
        
        case 'COUNT_DISTINCT':
          if (!parsed.property) {
            return { success: false, error: 'COUNT_DISTINCT requires a property' };
          }
          const uniqueValues = new Set(results.map(item => (item as any)[parsed.property]));
          return { success: true, value: uniqueValues.size };
        
        case 'AVG':
        case 'SUM':
        case 'MIN':
        case 'MAX':
          if (!parsed.property) {
            return { success: false, error: `${func} requires a property` };
          }
          return this.executeNumericAgg(results, parsed.property, func.toLowerCase() as 'avg' | 'sum' | 'min' | 'max');
        
        case 'EXISTS':
          return { success: true, value: results.length > 0 };
        
        case 'NOT_EXISTS':
          return { success: true, value: results.length === 0 };
        
        case 'MOST_FREQUENT':
          if (!parsed.property) {
            return { success: false, error: 'MOST_FREQUENT requires a property' };
          }
          return this.executeMostFrequent(results, parsed.property);
        
        default:
          return { success: false, error: `Unknown function: ${func}` };
      }
    } catch (error) {
      return {
        success: false,
        error: `Execution error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private traversePathOptimized(
    startType: string,
    path: string[],
    filters: Filter[],
    startNodeId: string
  ): (GraphNode | GraphLink)[] {
    let currentNodeIds = new Set<string>([startNodeId]);
    let currentItems: (GraphNode | GraphLink)[] = [];

    for (let i = 1; i < path.length; i++) {
      const step = path[i];
      const isEdgeStep = i % 2 === 1;
      
      if (isEdgeStep) {
        const edgeType = step;
        const edges: GraphLink[] = [];
        
        for (const nodeId of currentNodeIds) {
          const outEdges = this.adjacencyIndex.edgesFromNode.get(nodeId)?.get(edgeType) || [];
          const inEdges = this.adjacencyIndex.edgesToNode.get(nodeId)?.get(edgeType) || [];
          edges.push(...outEdges, ...inEdges);
        }
        
        const uniqueEdges = Array.from(new Map(edges.map(e => [e.source + '-' + e.target, e])).values());
        currentItems = uniqueEdges;
        currentNodeIds.clear();
      } else {
        const nodeType = step;
        const nodeIds = new Set<string>();
        const nodeTypeSet = this.adjacencyIndex.nodesByType.get(nodeType);
        
        for (const edge of currentItems as GraphLink[]) {
          if (nodeTypeSet?.has(edge.source)) {
            nodeIds.add(edge.source);
          }
          if (nodeTypeSet?.has(edge.target)) {
            nodeIds.add(edge.target);
          }
        }
        
        currentNodeIds = nodeIds;
        currentItems = this.graphData.nodes.filter(n => nodeIds.has(n.id));
      }
    }

    return this.applyFilters(currentItems, filters);
  }

  private applyFilters(
    items: (GraphNode | GraphLink)[],
    filters: Filter[]
  ): (GraphNode | GraphLink)[] {
    return items.filter(item => {
      return filters.every(filter => {
        const value = (item as any)[filter.attribute];
        
        switch (filter.type) {
          case 'range':
            if (filter.min !== undefined && value < filter.min) return false;
            if (filter.max !== undefined && value > filter.max) return false;
            return true;
          case 'categorical':
            return filter.values?.some(filterVal => {
              if (typeof value === 'boolean') {
                return String(value) === filterVal;
              }
              return String(value) === filterVal;
            }) ?? false;
          case 'search':
            return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
          default:
            return true;
        }
      });
    });
  }

  private executeNumericAgg(
    results: (GraphNode | GraphLink)[],
    property: string,
    op: 'avg' | 'sum' | 'min' | 'max'
  ): { success: boolean; value?: any } {
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

  private executeMostFrequent(
    results: (GraphNode | GraphLink)[],
    property: string
  ): { success: boolean; value?: any } {
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

  public invalidate() {
    this.adjacencyIndex = this.buildIndices();
  }
}
