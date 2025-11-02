import React, { useState } from 'react';
import ExpressionBuilder from './ExpressionBuilder';
import { executeExpression, parseExpression } from '../utils/expressionParser';

type DeriveAttributePanelProps = {
  deriveBuilder: any;
  setDeriveBuilder: (builder: any) => void;
  selectedNodeType: string | null;
  graphData: any;
  currentQuery: string[];
  activeFilters: any;
  computeDerivedBoolean: (name: string, startType: string, path: string[], filters: any[]) => void;
  computeDerivedNumeric: (name: string, startType: string, path: string[], filters: any[], op: string, prop?: string, propContext?: "node" | "edge") => void;
  computeDerivedCategorical: (name: string, startType: string, path: string[], filters: any[], op: string, prop?: string, propContext?: "node" | "edge") => void;
  setGraphData: any;
  onComplete?: () => void;
};

const DeriveAttributePanel: React.FC<DeriveAttributePanelProps> = ({
  deriveBuilder,
  setDeriveBuilder,
  selectedNodeType,
  graphData,
  currentQuery,
  activeFilters,
  computeDerivedBoolean,
  computeDerivedNumeric,
  computeDerivedCategorical,
  setGraphData,
  onComplete
}) => {
  const [expression, setExpression] = useState('');
  const [expressionError, setExpressionError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Get available attributes with metadata
  const availableAttributes = React.useMemo(() => {
    if (!graphData || !deriveBuilder.startType) return [];
    
    type AttributeMetadata = {
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
    
    const attrMetadata: AttributeMetadata[] = [];
    
    // Add attributes from the path
    deriveBuilder.path.forEach((step: string, idx: number) => {
      const isNode = idx % 2 === 0;
      if (isNode) {
        const nodeType = step;
        const nodesOfType = graphData.nodes?.filter((n: any) => n['Node Type'] === nodeType) || [];
        
        if (nodesOfType.length > 0) {
          const sampleNode = nodesOfType[0];
          Object.keys(sampleNode).forEach(key => {
            if (key !== 'id' && key !== 'Node Type') {
              const values = nodesOfType.map((n: any) => (n as any)[key]).filter((v: any) => v !== null && v !== undefined && v !== '');
              const uniqueValues = [...new Set(values)];
              const cardinality = uniqueValues.length;
              const completeness = (values.length / nodesOfType.length) * 100;
              
              const hasNumbers = values.some((v: any) => !isNaN(v) && typeof v === 'number');
              const hasStrings = values.some((v: any) => typeof v === 'string');
              const isNumeric = hasNumbers && !hasStrings;
              const isBoolean = values.every((v: any) => typeof v === 'boolean');
              
              let min, max, mean;
              if (isNumeric) {
                const numericValues = values.filter((v: any) => typeof v === 'number' && !isNaN(v));
                min = Math.min(...numericValues);
                max = Math.max(...numericValues);
                mean = numericValues.reduce((a: number, b: number) => a + b, 0) / numericValues.length;
              }
              
              const distribution: { [key: string]: number } = {};
              values.forEach((v: any) => {
                const key = String(v);
                distribution[key] = (distribution[key] || 0) + 1;
              });
              
              attrMetadata.push({
                name: `${nodeType}.${key}`,
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
              });
            }
          });
        }
      } else {
        const edgeType = step;
        const edgesOfType = graphData.links?.filter((e: any) => e.type === edgeType) || [];
        
        if (edgesOfType.length > 0) {
          const sampleEdge = edgesOfType[0];
          Object.keys(sampleEdge).forEach(key => {
            if (key !== 'source' && key !== 'target' && key !== 'type') {
              const values = edgesOfType.map((e: any) => (e as any)[key]).filter((v: any) => v !== null && v !== undefined && v !== '');
              const uniqueValues = [...new Set(values)];
              const cardinality = uniqueValues.length;
              const completeness = (values.length / edgesOfType.length) * 100;
              
              const hasNumbers = values.some((v: any) => !isNaN(v) && typeof v === 'number');
              const hasStrings = values.some((v: any) => typeof v === 'string');
              const isNumeric = hasNumbers && !hasStrings;
              const isBoolean = values.every((v: any) => typeof v === 'boolean');
              
              let min, max, mean;
              if (isNumeric) {
                const numericValues = values.filter((v: any) => typeof v === 'number' && !isNaN(v));
                min = Math.min(...numericValues);
                max = Math.max(...numericValues);
                mean = numericValues.reduce((a: number, b: number) => a + b, 0) / numericValues.length;
              }
              
              const distribution: { [key: string]: number } = {};
              values.forEach((v: any) => {
                const key = String(v);
                distribution[key] = (distribution[key] || 0) + 1;
              });
              
              attrMetadata.push({
                name: `${edgeType}.${key}`,
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
              });
            }
          });
        }
      }
    });
    
    return attrMetadata;
  }, [graphData, deriveBuilder.path, deriveBuilder.startType]);

  const availableFunctions = [
    'COUNT',
    'COUNT_DISTINCT',
    'AVG',
    'SUM',
    'MIN',
    'MAX',
    'EXISTS',
    'NOT_EXISTS',
    'MOST_FREQUENT'
  ];

  return (
    <div className="space-y-3">
      {/* Expression Builder Mode */}
      {deriveBuilder.stage === 'measure' && (
        <div className="space-y-3 p-3 border border-vercel-border rounded bg-vercel-bg">
          <div className="text-xs font-mono text-vercel-black font-semibold">
            Expression Builder
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-mono text-vercel-gray">Attribute Name</label>
            <input
              type="text"
              value={deriveBuilder.name}
              onChange={(e) => setDeriveBuilder((prev: any) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., average_collaborator_age"
              className="w-full px-3 py-2 text-xs font-mono border border-vercel-border rounded focus:outline-none focus:border-vercel-black"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono text-vercel-gray">Expression</label>
            <ExpressionBuilder
              value={expression}
              onChange={(val) => {
                setExpression(val);
                setExpressionError(null);
                
                // Validate on change
                if (val.trim()) {
                  const parsed = parseExpression(val);
                  if (!parsed) {
                    setExpressionError('Invalid expression format');
                  }
                }
              }}
              availableAttributes={availableAttributes}
              availableFunctions={availableFunctions}
              placeholder="e.g., AVG(Person.age) or COUNT(Song.single==True)"
            />
            {expressionError && (
              <div className="text-xs font-mono text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                {expressionError}
              </div>
            )}
          </div>

          <div className="text-xs font-mono text-vercel-gray space-y-1">
            <div className="font-semibold">Available Functions:</div>
            <div className="flex flex-wrap gap-1">
              {availableFunctions.map(fn => (
                <code key={fn} className="px-1.5 py-0.5 bg-white border border-vercel-border rounded text-[10px]">
                  {fn}
                </code>
              ))}
            </div>
          </div>

          {availableAttributes.length > 0 && (
            <div className="text-xs font-mono text-vercel-gray space-y-1">
              <div className="font-semibold">Available Attributes:</div>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {availableAttributes.map(attr => (
                  <code key={attr.name} className="block px-1.5 py-0.5 bg-white border border-vercel-border rounded text-[10px]">
                    {attr.name}
                  </code>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={async () => {
                console.log('[DeriveAttributePanel] Create clicked', { 
                  startType: deriveBuilder.startType, 
                  name: deriveBuilder.name, 
                  expression,
                  path: deriveBuilder.path 
                });
                
                if (!deriveBuilder.startType || !deriveBuilder.name || !expression) {
                  console.log('[DeriveAttributePanel] Early return - missing required fields');
                  return;
                }
                
                setIsCalculating(true);
                
                const currentStep = currentQuery.length - 1;
                const endContext = deriveBuilder.path[deriveBuilder.path.length - 1];
                const endFilters = activeFilters.nodeFilters.filter((f: any) => 
                  f.queryStep === currentStep && f.queryContext === endContext
                );
                
                console.log('[DeriveAttributePanel] Filters:', { currentStep, endContext, endFilters });
                
                // Execute the expression for each start node
                const startNodes = graphData.nodes.filter(
                  (n: any) => n['Node Type'] === deriveBuilder.startType
                );
                
                console.log('[DeriveAttributePanel] Start nodes:', startNodes.length);
                
                const results = new Map<string, any>();
                
                // Use setTimeout to allow UI to update
                await new Promise(resolve => setTimeout(resolve, 0));
                
                // Execute expression for each start node individually
                for (const node of startNodes) {
                  console.log('[DeriveAttributePanel] Executing for node:', node.id);
                  const result = executeExpression(
                    expression,
                    deriveBuilder.startType,
                    deriveBuilder.path,
                    graphData,
                    endFilters,
                    node.id
                  );
                  
                  console.log('[DeriveAttributePanel] Result:', result);
                  
                  if (!result.success) {
                    console.error('[DeriveAttributePanel] Execution failed:', result.error);
                    setExpressionError(result.error || 'Expression execution failed');
                    setIsCalculating(false);
                    return;
                  }
                  
                  results.set(node.id, result.value);
                }
                
                console.log('[DeriveAttributePanel] All results:', Array.from(results.entries()));
                
                // Update graph data with new attribute
                setGraphData((prev: any) => {
                  if (!prev) return prev;
                  
                  const updatedNodes = prev.nodes.map((n: any) => {
                    if (n['Node Type'] !== deriveBuilder.startType) return n;
                    const value = results.get(n.id);
                    return { ...n, [deriveBuilder.name]: value };
                  });
                  
                  return { ...prev, nodes: updatedNodes };
                });
                
                setIsCalculating(false);
                
                // Reset builder
                setDeriveBuilder({ 
                  active: false, 
                  stage: null, 
                  method: null, 
                  name: '', 
                  path: [], 
                  startType: null, 
                  measureType: null, 
                  measureOp: null, 
                  measureProp: null, 
                  measurePropContext: null 
                });
                
                setExpression('');
                
                // Call completion callback
                if (onComplete) {
                  onComplete();
                }
              }}
              disabled={!deriveBuilder.name || !expression || isCalculating}
              className="px-3 py-1.5 text-xs font-mono rounded border border-vercel-black bg-vercel-black text-white hover:bg-vercel-gray disabled:opacity-30 transition-colors"
            >
              {isCalculating ? 'Calculating...' : 'Create Attribute'}
            </button>
            <button
              onClick={() => {
                setDeriveBuilder({ active: false, stage: null, method: null, name: '', path: [], startType: null, measureType: null, measureOp: null, measureProp: null, measurePropContext: null });
                setExpression('');
              }}
              className="px-3 py-1.5 text-xs font-mono rounded border border-vercel-border bg-white text-vercel-black hover:bg-vercel-bg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeriveAttributePanel;
