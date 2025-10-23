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
  setGraphData
}) => {
  const [useAdvancedMode, setUseAdvancedMode] = useState(false);
  const [expression, setExpression] = useState('');
  const [expressionError, setExpressionError] = useState<string | null>(null);

  // Get available attributes and functions
  const availableAttributes = React.useMemo(() => {
    if (!graphData || !deriveBuilder.startType) return [];
    const attrs: string[] = [];
    
    // Add attributes from the path
    deriveBuilder.path.forEach((step: string, idx: number) => {
      const isNode = idx % 2 === 0;
      if (isNode) {
        const nodeType = step;
        const sampleNode = graphData.nodes?.find((n: any) => n['Node Type'] === nodeType);
        if (sampleNode) {
          Object.keys(sampleNode).forEach(key => {
            if (key !== 'id' && key !== 'Node Type') {
              attrs.push(`${nodeType}.${key}`);
            }
          });
        }
      } else {
        const edgeType = step;
        const sampleEdge = graphData.links?.find((e: any) => e.type === edgeType);
        if (sampleEdge) {
          Object.keys(sampleEdge).forEach(key => {
            if (key !== 'source' && key !== 'target' && key !== 'type') {
              attrs.push(`${edgeType}.${key}`);
            }
          });
        }
      }
    });
    
    return [...new Set(attrs)];
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
      {/* Mode Toggle */}
      {deriveBuilder.stage === 'measure' && (
        <div className="flex items-center gap-3 text-xs font-mono">
          <button
            onClick={() => setUseAdvancedMode(false)}
            className={`px-3 py-1.5 rounded border transition-colors ${
              !useAdvancedMode
                ? 'bg-vercel-black text-white border-vercel-black'
                : 'bg-white text-vercel-black border-vercel-border hover:bg-vercel-bg'
            }`}
          >
            Visual Builder
          </button>
          <button
            onClick={() => setUseAdvancedMode(true)}
            className={`px-3 py-1.5 rounded border transition-colors ${
              useAdvancedMode
                ? 'bg-vercel-black text-white border-vercel-black'
                : 'bg-white text-vercel-black border-vercel-border hover:bg-vercel-bg'
            }`}
          >
            Expression Builder
          </button>
        </div>
      )}

      {/* Expression Builder Mode */}
      {useAdvancedMode && deriveBuilder.stage === 'measure' && (
        <div className="space-y-3 p-3 border border-vercel-border rounded bg-vercel-bg">
          <div className="text-xs font-mono text-vercel-black font-semibold">
            Advanced Expression Builder
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
              placeholder="e.g., AVG(Person.age) or COUNT(Song)"
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
                  <code key={attr} className="block px-1.5 py-0.5 bg-white border border-vercel-border rounded text-[10px]">
                    {attr}
                  </code>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => {
                if (!deriveBuilder.startType || !deriveBuilder.name || !expression) return;
                
                const currentStep = currentQuery.length - 1;
                const endContext = deriveBuilder.path[deriveBuilder.path.length - 1];
                const endFilters = activeFilters.nodeFilters.filter((f: any) => 
                  f.queryStep === currentStep && f.queryContext === endContext
                );
                
                // Execute the expression for each start node
                const startNodes = graphData.nodes.filter(
                  (n: any) => n['Node Type'] === deriveBuilder.startType
                );
                
                const results = new Map<string, any>();
                
                // First validate the expression
                const testResult = executeExpression(
                  expression,
                  deriveBuilder.startType,
                  deriveBuilder.path,
                  graphData,
                  endFilters
                );
                
                if (!testResult.success) {
                  setExpressionError(testResult.error || 'Expression execution failed');
                  return;
                }
                
                startNodes.forEach((node: any) => {
                  const result = executeExpression(
                    expression,
                    deriveBuilder.startType,
                    deriveBuilder.path,
                    graphData,
                    endFilters
                  );
                  
                  if (result.success) {
                    results.set(node.id, result.value);
                  } else {
                    console.error(`Expression error for node ${node.id}:`, result.error);
                  }
                });
                
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
              }}
              disabled={!deriveBuilder.name || !expression}
              className="px-3 py-1.5 text-xs font-mono rounded border border-vercel-black bg-vercel-black text-white hover:bg-vercel-gray disabled:opacity-30 transition-colors"
            >
              Create Attribute
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
