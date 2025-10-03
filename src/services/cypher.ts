// Lightweight Cypher compiler + client used by the app.
// - Compiles the app's path+filters representation to Cypher
// - Executes queries via neo4j-driver when configured
//
// Notes:
// - We assume nodes are ingested with label = sanitized 'Node Type' and property 'id'
// - We assume relationships use type = sanitized 'Edge Type'
// - Property keys may include spaces; we escape as backticked in Cypher
// - Traversals are treated as undirected where appropriate to mirror UI behavior

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Filter = {
  attribute: string;
  type: 'range' | 'categorical' | 'search' | 'date_range';
  queryStep: number;
  queryContext: string;
  min?: number;
  max?: number;
  values?: string[];
  value?: string;
  startDate?: Date;
  endDate?: Date;
};

export type ActiveFilters = {
  nodeFilters: Filter[];
  edgeFilters: Filter[];
};

export type EdgeTypeSummary = { type: string; count: number; connectedNodeTypes: string[] };
export type GraphNode = { id: string; 'Node Type': string; [key: string]: any };
export type GraphLink = { source: string; target: string; 'Edge Type': string; [key: string]: any };

// --- Sanitizers to ensure valid Neo4j labels & relationship types ---
const sanitize = (name: string) =>
  String(name || '')
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1');

const labelFor = (nodeType: string) => sanitize(nodeType);
const relTypeFor = (edgeType: string) => sanitize(edgeType).toUpperCase();

// Escape a property key (may contain spaces or punctuation)
const prop = (key: string) => `\`${key}\``;

// --- Filter compilation helpers ---
const buildNodeWhere = (alias: string, filters: Filter[], params: Record<string, any>) => {
  const clauses: string[] = [];
  filters.forEach((f, i) => {
    const kBase = `${alias}_f${i}`;
    const key = `${alias}_${sanitize(f.attribute)}_${i}`;
    switch (f.type) {
      case 'range': {
        if (typeof f.min === 'number') {
          clauses.push(`toFloat(${alias}.${prop(f.attribute)}) >= $${key}_min`);
          params[`${key}_min`] = f.min;
        }
        if (typeof f.max === 'number') {
          clauses.push(`toFloat(${alias}.${prop(f.attribute)}) <= $${key}_max`);
          params[`${key}_max`] = f.max;
        }
        break;
      }
      case 'categorical': {
        clauses.push(`${alias}.${prop(f.attribute)} IN $${key}_vals`);
        params[`${key}_vals`] = f.values || [];
        break;
      }
      case 'search': {
        clauses.push(`toLower(toString(${alias}.${prop(f.attribute)})) CONTAINS toLower($${key}_q)`);
        params[`${key}_q`] = f.value || '';
        break;
      }
      case 'date_range': {
        if (f.startDate) {
          clauses.push(`datetime(toString(${alias}.${prop(f.attribute)})) >= datetime($${key}_start)`);
          params[`${key}_start`] = f.startDate.toISOString();
        }
        if (f.endDate) {
          clauses.push(`datetime(toString(${alias}.${prop(f.attribute)})) <= datetime($${key}_end)`);
          params[`${key}_end`] = f.endDate.toISOString();
        }
        break;
      }
      default:
        break;
    }
  });
  return clauses;
};

const buildEdgeWhere = (alias: string, filters: Filter[], params: Record<string, any>) => {
  const clauses: string[] = [];
  filters.forEach((f, i) => {
    const key = `${alias}_${sanitize(f.attribute)}_${i}`;
    switch (f.type) {
      case 'range': {
        if (typeof f.min === 'number') {
          clauses.push(`toFloat(${alias}.${prop(f.attribute)}) >= $${key}_min`);
          params[`${key}_min`] = f.min;
        }
        if (typeof f.max === 'number') {
          clauses.push(`toFloat(${alias}.${prop(f.attribute)}) <= $${key}_max`);
          params[`${key}_max`] = f.max;
        }
        break;
      }
      case 'categorical': {
        clauses.push(`${alias}.${prop(f.attribute)} IN $${key}_vals`);
        params[`${key}_vals`] = f.values || [];
        break;
      }
      case 'search': {
        clauses.push(`toLower(toString(${alias}.${prop(f.attribute)})) CONTAINS toLower($${key}_q)`);
        params[`${key}_q`] = f.value || '';
        break;
      }
      default:
        break;
    }
  });
  return clauses;
};

// --- Cypher compilation for a path ---
// path: [NodeType, EdgeType, NodeType, ...]
export const compilePathMatch = (path: string[], allFilters: ActiveFilters) => {
  if (!path || path.length === 0) {
    return { match: '', where: '', aliases: { nodes: [], rels: [] as string[] }, params: {} as any };
  }
  const nodes: string[] = [];
  const rels: string[] = [];
  const patternParts: string[] = [];
  const params: Record<string, any> = {};
  const whereClauses: string[] = [];

  // Build aliases
  let aliasIndex = 0;
  for (let i = 0; i < path.length; i++) {
    if (i % 2 === 0) {
      const a = `n${aliasIndex}`;
      nodes.push(a);
      aliasIndex += 1;
    } else {
      const a = `r${i}`; // unique per edge step
      rels.push(a);
    }
  }

  // Build pattern
  let nodeAliasIdx = 0;
  for (let i = 0; i < path.length; i++) {
    if (i % 2 === 0) {
      const nodeAlias = nodes[nodeAliasIdx];
      const label = labelFor(path[i]);
      patternParts.push(`(${nodeAlias}:${label})`);

      // Node filters at this step
      const nodeFilters = (allFilters.nodeFilters || []).filter(
        (f) => f.queryStep === i && f.queryContext === path[i]
      );
      const clauses = buildNodeWhere(nodeAlias, nodeFilters, params);
      whereClauses.push(...clauses);

      nodeAliasIdx += 1;
    } else {
      const relAlias = `r${i}`;
      const relType = relTypeFor(path[i]);
      // Use undirected to mirror UI traversal semantics
      patternParts.push(`-[${relAlias}:${relType}]-`);

      // Edge filters at this step
      const edgeFilters = (allFilters.edgeFilters || []).filter(
        (f) => f.queryStep === i && f.queryContext === path[i]
      );
      const clauses = buildEdgeWhere(relAlias, edgeFilters, params);
      whereClauses.push(...clauses);
    }
  }

  const match = `MATCH ${patternParts.join('')}`;
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { match, where, aliases: { nodes, rels }, params };
};

// --- High-level compilers ---

export const compileConnectedNodes = (path: string[], filters: ActiveFilters) => {
  // Expected path: [NodeType, EdgeType] or longer (we return last node alias)
  const { match, where, aliases, params } = compilePathMatch(path, filters);
  // If the path ends on an edge, add a trailing wildcard node
  let returnAlias: string;
  if (path.length % 2 === 0) {
    // Ends on edge; add a final node
    const lastEdgeType = relTypeFor(path[path.length - 1]);
    const lastNodeAlias = `n${aliases.nodes.length}`;
    const extendedMatch = `${match}-[r_last:${lastEdgeType}]-(${lastNodeAlias})`;
    return {
      cypher: `${extendedMatch} ${where} RETURN DISTINCT ${lastNodeAlias} AS node`,
      params,
    };
  } else {
    // Ends on node
    returnAlias = aliases.nodes[aliases.nodes.length - 1];
    return { cypher: `${match} ${where} RETURN DISTINCT ${returnAlias} AS node`, params };
  }
};

export const compileEdgeTypeSummary = (nodeType: string, filters: ActiveFilters) => {
  // Only step 0 node filters apply here (edge types for a selected node type)
  const path = [nodeType];
  const { match, where, aliases, params } = compilePathMatch(path, filters);
  const n = aliases.nodes[0];
  const cypher = `
    ${match}
    ${where}
    MATCH (${n})-[r]-(m)
    WITH type(r) AS edgeType, count(r) AS cnt, collect(distinct m.\`Node Type\`) AS allTypes
    RETURN edgeType AS type, cnt AS count, [t IN allTypes WHERE t <> $selectedNodeType] AS connectedNodeTypes
  `;
  return { cypher, params: { ...params, selectedNodeType: nodeType } };
};

export const compileNodeTypeSummary = (path: string[], filters: ActiveFilters) => {
  // If no path, summarize by labels across graph; else summarize the last node alias in path
  if (!path || path.length === 0) {
    return {
      cypher: `MATCH (n) WITH labels(n)[0] AS type, count(*) AS count RETURN type, count ORDER BY count DESC`,
      params: {},
    };
  }
  const { match, where, aliases, params } = compilePathMatch(path, filters);
  const n = aliases.nodes[aliases.nodes.length - 1];
  const cypher = `${match} ${where} WITH ${n} AS n RETURN labels(n)[0] AS type, count(*) AS count ORDER BY count DESC`;
  return { cypher, params };
};

// --- Client ---
let _driver: any = null;

const getDriver = async () => {
  if (_driver) return _driver;
  const uri = process.env.REACT_APP_NEO4J_URI;
  const user = process.env.REACT_APP_NEO4J_USER;
  const password = process.env.REACT_APP_NEO4J_PASSWORD;
  const enabled = process.env.REACT_APP_USE_CYPHER_BACKEND === 'true';
  if (!enabled) return null;
  if (!uri || !user || !password) {
    console.warn('Cypher backend enabled but missing REACT_APP_NEO4J_* env vars');
    return null;
  }
  try {
    // Dynamic import to avoid bundling if not used
    // @ts-ignore
    const neo4j = await import('neo4j-driver');
    _driver = (neo4j as any).driver(uri, (neo4j as any).auth.basic(user, password));
    return _driver;
  } catch (e) {
    console.error('Failed to init neo4j-driver. Did you install it?', e);
    return null;
  }
};

const run = async (cypher: string, params: Record<string, any> = {}) => {
  const driver = await getDriver();
  if (!driver) throw new Error('Cypher backend not available');
  const session = driver.session();
  try {
    const res = await session.run(cypher, params);
    return res.records;
  } finally {
    await session.close();
  }
};

// Public high-level API used by App
export const CypherService = {
  isEnabled: () => process.env.REACT_APP_USE_CYPHER_BACKEND === 'true',

  // Fetch edge type summary for a node type
  async edgeTypesForNodeType(nodeType: string, filters: ActiveFilters): Promise<EdgeTypeSummary[]> {
    const { cypher, params } = compileEdgeTypeSummary(nodeType, filters);
    const records = await run(cypher, params);
    return records.map((r: any) => ({
      type: r.get('type'),
      count: Number(r.get('count')),
      connectedNodeTypes: (r.get('connectedNodeTypes') || []).map((t: any) => String(t)),
    }));
  },

  // Fetch nodes connected via the given path (usually [NodeType, EdgeType])
  async connectedNodes(path: string[], filters: ActiveFilters): Promise<GraphNode[]> {
    const { cypher, params } = compileConnectedNodes(path, filters);
    const records = await run(cypher, params);
    return records.map((r: any) => {
      const node = r.get('node');
      const labels = node.labels || [];
      const props = node.properties || {};
      const nodeType = props['Node Type'] || labels[0] || 'Unknown';
      return { id: String(props.id), 'Node Type': String(nodeType), ...props } as GraphNode;
    });
  },

  // Fetch node type counts (optionally scoped by a compiled path)
  async nodeTypeSummary(path: string[], filters: ActiveFilters): Promise<{ type: string; count: number }[]> {
    const { cypher, params } = compileNodeTypeSummary(path, filters);
    const records = await run(cypher, params);
    return records.map((r: any) => ({ type: r.get('type'), count: Number(r.get('count')) }));
  },

  // Fetch raw edges for an edge type (used by edge attribute panel)
  async edgesByType(edgeType: string): Promise<GraphLink[]> {
    const rel = relTypeFor(edgeType);
    const cypher = `
      MATCH (a)-[e:${rel}]->(b)
      RETURN a.id AS source, b.id AS target, type(e) AS edgeType, properties(e) AS props
    `;
    const records = await run(cypher, {});
    return records.map((r: any) => ({
      source: String(r.get('source')),
      target: String(r.get('target')),
      'Edge Type': String(r.get('edgeType')),
      ...(r.get('props') || {}),
    }));
  },
};
