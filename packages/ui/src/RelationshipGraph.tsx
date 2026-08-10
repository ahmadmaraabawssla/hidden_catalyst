'use client';

import React, { useEffect, useRef } from 'react';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  isCompany: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
  confidence: number;
  directness: string;
}

interface RelationshipGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Interactive SVG entity relationship graph.
 * 
 * Renders entities as nodes with connecting edges.
 * Company nodes are highlighted in brand color.
 * Agency nodes are in purple.
 * Click navigates to entity detail.
 */
export function RelationshipGraph({ nodes, edges }: RelationshipGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (nodes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No relationships found for this entity.
      </div>
    );
  }

  // Simple force-directed layout
  const width = 600;
  const height = 400;
  const centerX = width / 2;
  const centerY = height / 2;

  // Arrange nodes in a circle
  const positions = nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    const radius = Math.min(width, height) * 0.35;
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });

  const nodeMap = new Map(positions.map(n => [n.id, n]));

  const nodeColor = (type: string, isCompany: boolean) => {
    if (isCompany) return 'fill-brand-700';
    switch (type) {
      case 'agency': return 'fill-purple-600';
      case 'person': return 'fill-amber-600';
      case 'product': return 'fill-teal-600';
      default: return 'fill-gray-600';
    }
  };

  return (
    <div ref={containerRef} className="overflow-auto">
      <svg width={width} height={height} className="mx-auto">
        {/* Edges */}
        {edges.map((edge, i) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;

          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;

          return (
            <g key={`edge-${i}`}>
              <line
                x1={from.x} y1={from.y}
                x2={to.x} y2={to.y}
                stroke={edge.directness === 'direct' ? '#3b6cf4' : '#9ca3af'}
                strokeWidth={edge.directness === 'direct' ? 2 : 1}
                strokeDasharray={edge.directness === 'indirect' ? '5,5' : undefined}
                opacity={edge.confidence < 0.5 ? 0.4 : 0.8}
              />
              <text
                x={midX} y={midY - 4}
                textAnchor="middle"
                className="text-[10px] fill-gray-500"
              >
                {edge.label}
              </text>
              {edge.confidence < 1 && (
                <text
                  x={midX} y={midY + 10}
                  textAnchor="middle"
                  className="text-[9px] fill-gray-400"
                >
                  {(edge.confidence * 100).toFixed(0)}%
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {positions.map((node) => (
          <g key={`node-${node.id}`} className="cursor-pointer" onClick={() => {
            if (node.isCompany) {
              window.location.href = `/companies/${node.label}`;
            }
          }}>
            {/* Node circle */}
            <circle
              cx={node.x} cy={node.y}
              r={node.isCompany ? 24 : 18}
              className={`${nodeColor(node.type, node.isCompany)} stroke-white`}
              strokeWidth={2}
              opacity={0.9}
            />
            {/* Label */}
            <text
              x={node.x}
              y={node.y + (node.isCompany ? 36 : 28)}
              textAnchor="middle"
              className={`text-[11px] ${node.isCompany ? 'fill-gray-900 font-semibold' : 'fill-gray-600'}`}
            >
              {node.label.length > 18 ? node.label.slice(0, 16) + '...' : node.label}
            </text>
            {/* Node type badge */}
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              className="text-[9px] fill-white font-medium"
            >
              {node.type.slice(0, 3).toUpperCase()}
            </text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-brand-700" /> Company
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-purple-600" /> Agency
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-amber-600" /> Person
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-teal-600" /> Product
        </div>
      </div>
    </div>
  );
}
