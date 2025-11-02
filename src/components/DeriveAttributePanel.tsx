import React, { useState, useMemo } from 'react';
import ExpressionBuilder from './ExpressionBuilder';
import AttributeTooltipChart from './AttributeTooltipChart';
import { parseExpression } from '../utils/expressionParser';
import { GraphQueryEngine } from '../utils/graphQueryEngine';
import { AttributeMetadataCache } from '../utils/attributeMetadata';

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
  const [progress, setProgress] = useState(0);
  const [hoveredAttribute, setHoveredAttribute] = useState<string | null>(null);

  const queryEngine = useMemo(
    () => new GraphQueryEngine(graphData),
    [graphData]
  );

  const metadataCache = useMemo(() => new AttributeMetadataCache(), []);

  const availableAttributes = useMemo(() => {
    if (!graphData || !deriveBuilder.startType || deriveBuilder.path.length === 0) return [];
    return metadataCache.getMetadataForPath(graphData, deriveBuilder.path);
  }, [graphData, deriveBuilder.path, deriveBuilder.startType, metadataCache]);

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
                  <div 
                    key={attr.name} 
                    className="relative"
                    onMouseEnter={() => setHoveredAttribute(attr.name)}
                    onMouseLeave={() => setHoveredAttribute(null)}
                  >
                    <code className="block px-1.5 py-0.5 bg-white border border-vercel-border rounded text-[10px] hover:bg-vercel-bg cursor-pointer transition-colors">
                      {attr.name}
                    </code>
                    
                    {hoveredAttribute === attr.name && (
                      <div 
                        className="absolute left-full top-0 ml-2 z-50"
                        onMouseEnter={() => setHoveredAttribute(attr.name)}
                        onMouseLeave={() => setHoveredAttribute(null)}
                      >
                        <AttributeTooltipChart attribute={attr} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={async () => {
                if (!deriveBuilder.startType || !deriveBuilder.name || !expression) {
                  return;
                }
                
                setIsCalculating(true);
                setProgress(0);
                
                try {
                  const currentStep = currentQuery.length - 1;
                  const endContext = deriveBuilder.path[deriveBuilder.path.length - 1];
                  const endFilters = activeFilters.nodeFilters.filter((f: any) => 
                    f.queryStep === currentStep && f.queryContext === endContext
                  );
                  
                  const results = await queryEngine.executeExpression(
                    expression,
                    deriveBuilder.startType,
                    deriveBuilder.path,
                    endFilters,
                    {
                      batchSize: 100,
                      onProgress: (pct) => setProgress(pct)
                    }
                  );
                  
                  setGraphData((prev: any) => {
                    if (!prev) return prev;
                    
                    const updatedNodes = prev.nodes.map((n: any) => {
                      if (n['Node Type'] !== deriveBuilder.startType) return n;
                      const value = results.get(n.id);
                      return { ...n, [deriveBuilder.name]: value };
                    });
                    
                    return { ...prev, nodes: updatedNodes };
                  });
                  
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
                  
                  if (onComplete) {
                    onComplete();
                  }
                } catch (error) {
                  console.error('[DeriveAttributePanel] Execution failed:', error);
                  setExpressionError(error instanceof Error ? error.message : 'Expression execution failed');
                } finally {
                  setIsCalculating(false);
                  setProgress(0);
                }
              }}
              disabled={!deriveBuilder.name || !expression || isCalculating}
              className="px-3 py-1.5 text-xs font-mono rounded border border-vercel-black bg-vercel-black text-white hover:bg-vercel-gray disabled:opacity-30 transition-colors"
            >
              {isCalculating ? `Calculating... ${Math.round(progress)}%` : 'Create Attribute'}
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
