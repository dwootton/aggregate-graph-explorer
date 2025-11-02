import React from 'react';

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

type AttributeTooltipChartProps = {
  attribute: AttributeMetadata;
};

const AttributeTooltipChart: React.FC<AttributeTooltipChartProps> = ({ attribute }) => {
  const maxBars = 10;
  const width = 240;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (attribute.isNumeric) {
    const values = Object.keys(attribute.distribution)
      .map(k => parseFloat(k))
      .filter(v => !isNaN(v))
      .sort((a, b) => a - b);
    
    const numBins = Math.min(15, Math.ceil(Math.sqrt(values.length)));
    const min = attribute.min ?? Math.min(...values);
    const max = attribute.max ?? Math.max(...values);
    const binWidth = (max - min) / numBins;
    
    const bins: { start: number; end: number; count: number }[] = [];
    for (let i = 0; i < numBins; i++) {
      const start = min + i * binWidth;
      const end = start + binWidth;
      const count = values.filter(v => v >= start && (i === numBins - 1 ? v <= end : v < end)).length;
      bins.push({ start, end, count });
    }
    
    const maxCount = Math.max(...bins.map(b => b.count));
    const xScale = (val: number) => ((val - min) / (max - min)) * chartWidth;
    const yScale = (count: number) => chartHeight - (count / maxCount) * chartHeight;
    
    return (
      <div className="bg-white border border-vercel-border rounded shadow-lg p-3 text-xs">
        <div className="font-semibold text-vercel-black mb-2">{attribute.name}</div>
        <svg width={width} height={height}>
          <g transform={`translate(${padding.left},${padding.top})`}>
            {bins.map((bin, i) => (
              <rect
                key={i}
                x={xScale(bin.start)}
                y={yScale(bin.count)}
                width={Math.max(1, xScale(bin.end) - xScale(bin.start) - 1)}
                height={chartHeight - yScale(bin.count)}
                fill="#000000"
                fillOpacity={0.8}
                stroke="#000000"
                strokeWidth={0.5}
              />
            ))}
            <line
              x1={0}
              y1={chartHeight}
              x2={chartWidth}
              y2={chartHeight}
              stroke="#000000"
              strokeWidth={1}
            />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={chartHeight}
              stroke="#000000"
              strokeWidth={1}
            />
            <text x={0} y={chartHeight + 20} fontSize={10} fill="#666" textAnchor="start">
              {min.toFixed(1)}
            </text>
            <text x={chartWidth} y={chartHeight + 20} fontSize={10} fill="#666" textAnchor="end">
              {max.toFixed(1)}
            </text>
          </g>
        </svg>
        <div className="mt-2 text-vercel-gray space-y-1">
          <div>Type: <span className="text-vercel-black font-semibold">{attribute.type}</span></div>
          <div>Range: <span className="text-vercel-black">{min.toFixed(2)} - {max.toFixed(2)}</span></div>
          <div>Mean: <span className="text-vercel-black">{attribute.mean?.toFixed(2)}</span></div>
        </div>
      </div>
    );
  } else {
    const entries = Object.entries(attribute.distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxBars);
    
    const maxCount = Math.max(...entries.map(e => e[1]));
    const barWidth = chartWidth / entries.length;
    const yScale = (count: number) => chartHeight - (count / maxCount) * chartHeight;
    
    return (
      <div className="bg-white border border-vercel-border rounded shadow-lg p-3 text-xs">
        <div className="font-semibold text-vercel-black mb-2">{attribute.name}</div>
        <svg width={width} height={height}>
          <g transform={`translate(${padding.left},${padding.top})`}>
            {entries.map(([value, count], i) => (
              <g key={i}>
                <rect
                  x={i * barWidth}
                  y={yScale(count)}
                  width={Math.max(1, barWidth - 2)}
                  height={chartHeight - yScale(count)}
                  fill="#000000"
                  fillOpacity={0.8}
                  stroke="#000000"
                  strokeWidth={0.5}
                />
                <text
                  x={i * barWidth + barWidth / 2}
                  y={chartHeight + 15}
                  fontSize={9}
                  fill="#666"
                  textAnchor="middle"
                  transform={`rotate(-45, ${i * barWidth + barWidth / 2}, ${chartHeight + 15})`}
                >
                  {String(value).substring(0, 8)}
                </text>
              </g>
            ))}
            <line
              x1={0}
              y1={chartHeight}
              x2={chartWidth}
              y2={chartHeight}
              stroke="#000000"
              strokeWidth={1}
            />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={chartHeight}
              stroke="#000000"
              strokeWidth={1}
            />
          </g>
        </svg>
        <div className="mt-2 text-vercel-gray space-y-1">
          <div>Type: <span className="text-vercel-black font-semibold">{attribute.type}</span></div>
          <div>Cardinality: <span className="text-vercel-black">{attribute.cardinality}</span></div>
          <div>Completeness: <span className="text-vercel-black">{attribute.completeness.toFixed(1)}%</span></div>
        </div>
      </div>
    );
  }
};

export default AttributeTooltipChart;
