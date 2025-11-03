import { GraphNode, GraphLink } from '../types';

export type AttributeMetadata = {
  name: string;
  type: 'numeric' | 'boolean' | 'string' | 'date';
  isNumeric: boolean;
  isBoolean: boolean;
  cardinality: number;
  completeness: number;
  min?: number;
  max?: number;
  mean?: number;
  uniqueValues: any[];
  distribution: { [key: string]: number };
};

type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

export class AttributeMetadataCache {
  private cache: Map<string, AttributeMetadata[]>;
  private nodeTypeCache: Map<string, AttributeMetadata[]>;
  private edgeTypeCache: Map<string, AttributeMetadata[]>;

  constructor() {
    this.cache = new Map();
    this.nodeTypeCache = new Map();
    this.edgeTypeCache = new Map();
  }

  public getMetadataForPath(
    graphData: GraphData,
    path: string[]
  ): AttributeMetadata[] {
    const cacheKey = this.computePathKey(graphData, path);
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    const metadata = this.computeMetadataForPath(graphData, path);
    this.cache.set(cacheKey, metadata);
    
    return metadata;
  }

  private computePathKey(graphData: GraphData, path: string[]): string {
    return `${graphData.nodes.length}-${graphData.links.length}-${path.join(',')}`;
  }

  private computeMetadataForPath(
    graphData: GraphData,
    path: string[]
  ): AttributeMetadata[] {
    const attrMetadata: AttributeMetadata[] = [];
    
    path.forEach((step, idx) => {
      const isNode = idx % 2 === 0;
      
      if (isNode) {
        const nodeType = step;
        const nodeMetadata = this.getNodeTypeMetadata(graphData, nodeType);
        attrMetadata.push(...nodeMetadata);
      } else {
        const edgeType = step;
        const edgeMetadata = this.getEdgeTypeMetadata(graphData, edgeType);
        attrMetadata.push(...edgeMetadata);
      }
    });
    
    return attrMetadata;
  }

  private getNodeTypeMetadata(
    graphData: GraphData,
    nodeType: string
  ): AttributeMetadata[] {
    if (this.nodeTypeCache.has(nodeType)) {
      return this.nodeTypeCache.get(nodeType)!;
    }
    
    const nodesOfType = graphData.nodes.filter(n => n['Node Type'] === nodeType);
    
    if (nodesOfType.length === 0) {
      return [];
    }
    
    const metadata: AttributeMetadata[] = [];
    const allKeys = new Set<string>();
    
    nodesOfType.forEach(node => {
      Object.keys(node).forEach(key => {
        if (key !== 'id' && key !== 'Node Type') {
          allKeys.add(key);
        }
      });
    });
    
    allKeys.forEach(key => {
      const attrMetadata = this.computeAttributeStats(
        nodesOfType,
        key,
        `${nodeType}.${key}`
      );
      metadata.push(attrMetadata);
    });
    
    this.nodeTypeCache.set(nodeType, metadata);
    return metadata;
  }

  private getEdgeTypeMetadata(
    graphData: GraphData,
    edgeType: string
  ): AttributeMetadata[] {
    if (this.edgeTypeCache.has(edgeType)) {
      return this.edgeTypeCache.get(edgeType)!;
    }
    
    const edgesOfType = graphData.links.filter(e => e['Edge Type'] === edgeType);
    
    if (edgesOfType.length === 0) {
      return [];
    }
    
    const metadata: AttributeMetadata[] = [];
    const allKeys = new Set<string>();
    
    edgesOfType.forEach(edge => {
      Object.keys(edge).forEach(key => {
        if (key !== 'source' && key !== 'target' && key !== 'type' && key !== 'Edge Type') {
          allKeys.add(key);
        }
      });
    });
    
    allKeys.forEach(key => {
      const attrMetadata = this.computeAttributeStats(
        edgesOfType,
        key,
        `${edgeType}.${key}`
      );
      metadata.push(attrMetadata);
    });
    
    this.edgeTypeCache.set(edgeType, metadata);
    return metadata;
  }

  private computeAttributeStats(
    items: any[],
    key: string,
    fullName: string
  ): AttributeMetadata {
    const values = items
      .map(item => item[key])
      .filter(v => v !== null && v !== undefined && v !== '');
    
    const uniqueValues = [...new Set(values)];
    const cardinality = uniqueValues.length;
    const completeness = (values.length / items.length) * 100;
    
    const hasNumbers = values.some(v => !isNaN(v) && typeof v === 'number');
    const hasStrings = values.some(v => typeof v === 'string');
    const isNumeric = hasNumbers && !hasStrings;
    const isBoolean = values.every(v => typeof v === 'boolean');
    
    let min: number | undefined;
    let max: number | undefined;
    let mean: number | undefined;
    
    if (isNumeric) {
      const numericValues = values.filter(v => typeof v === 'number' && !isNaN(v));
      if (numericValues.length > 0) {
        min = Math.min(...numericValues);
        max = Math.max(...numericValues);
        mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      }
    }
    
    const distribution: { [key: string]: number } = {};
    values.forEach(v => {
      const key = String(v);
      distribution[key] = (distribution[key] || 0) + 1;
    });
    
    return {
      name: fullName,
      type: isNumeric ? 'numeric' : isBoolean ? 'boolean' : 'string',
      isNumeric,
      isBoolean,
      cardinality,
      completeness,
      min,
      max,
      mean,
      uniqueValues: uniqueValues.slice(0, 10),
      distribution
    };
  }

  public clear() {
    this.cache.clear();
    this.nodeTypeCache.clear();
    this.edgeTypeCache.clear();
  }

  public invalidate() {
    this.clear();
  }
}
