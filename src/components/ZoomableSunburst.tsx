/**
 * Zoomable Sunburst Chart Component for Test Results Visualization
 * Based on D3.js zoomable sunburst pattern with TypeScript
 */

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { SunburstNode, getNodeColor, getNodeDisplayText } from '../utils/dataTransformers';

interface ZoomableSunburstProps {
  data: SunburstNode;
  width?: number;
  height?: number;
  onNodeClick?: (node: SunburstNode) => void;
}

// Use looser typing to avoid D3.js type conflicts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D3Node = any;

export const ZoomableSunburst: React.FC<ZoomableSunburstProps> = ({
  data,
  width = 928,
  height = 928,
  onNodeClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<SunburstNode | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const radius = Math.min(width, height) / 2.2; // Improved radius calculation for better space utilization

    // Compute the layout with equal sizing
    const hierarchy = d3
      .hierarchy(data)
      .sum(() => 1) // Give each node equal weight
      .sort((a, b) => (a.data.name || '').localeCompare(b.data.name || '')); // Sort alphabetically for consistency

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const root = d3.partition().size([2 * Math.PI, hierarchy.height + 1])(hierarchy as any);

    // Store current position for each node
    root.each((d: D3Node) => {
      d.current = d;
    });

    // Create the arc generator with optimized settings for better space utilization
    const arc = d3
      .arc()
      .startAngle((d: D3Node) => d.x0)
      .endAngle((d: D3Node) => d.x1)
      .padAngle((d: D3Node) => Math.min((d.x1 - d.x0) / 2, 0.002)) // Reduced padding for better space use
      .padRadius(radius * 1.2) // Reduced pad radius
      .innerRadius((d: D3Node) => d.y0 * radius)
      .outerRadius((d: D3Node) => Math.max(d.y0 * radius, d.y1 * radius - 0.5)); // Reduced gap between rings

    // Create the SVG container with optimized viewBox for better space utilization
    const svg = d3
      .select(svgRef.current)
      .attr('viewBox', [-width / 2, -height / 2, width, height]) // Use height instead of width for viewBox
      .style('font', '10px sans-serif');

    // Store the current focus level for dynamic visibility
    let focusDepth = 0;

    // Helper functions for improved visibility
    function arcVisible(d: D3Node) {
      // Show 3 levels down from the current focus point
      // At root level (focusDepth = 0): show levels 1-3 (teams, applications, suites)
      // When zoomed to team level (focusDepth = 1): show levels 1-4 (team, applications, suites, executions)
      const maxVisibleDepth = focusDepth + 3;
      const minVisibleDepth = Math.max(1, focusDepth); // Never show root level

      return d.y1 <= maxVisibleDepth && d.y0 >= minVisibleDepth && d.x1 > d.x0;
    }

    function labelVisible(d: D3Node) {
      // Same visibility logic as arcs, but with size threshold for readability
      const maxVisibleDepth = focusDepth + 3;
      const minVisibleDepth = Math.max(1, focusDepth);

      return (
        d.y1 <= maxVisibleDepth && d.y0 >= minVisibleDepth && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.02
      );
    }

    function labelTransform(d: D3Node) {
      const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI;
      const y = ((d.y0 + d.y1) / 2) * radius;
      return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
    }

    // Append the arcs
    const path = svg
      .append('g')
      .selectAll('path')
      .data(root.descendants().slice(1))
      .join('path')
      .attr('fill', (d: D3Node) => getNodeColor(d.data))
      .attr('fill-opacity', (d: D3Node) => (arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0))
      .attr('pointer-events', (d: D3Node) => (arcVisible(d.current) ? 'auto' : 'none'))
      .attr('d', (d: D3Node) => arc(d.current))
      .style('cursor', (d: D3Node) => (d.children ? 'pointer' : 'default'));

    // Add hover effects
    path
      .on('mouseenter', function (event: MouseEvent, d: D3Node) {
        d3.select(this)
          .transition()
          .duration(100)
          .attr('fill-opacity', arcVisible(d.current) ? (d.children ? 0.8 : 0.6) : 0);
      })
      .on('mouseleave', function (event: MouseEvent, d: D3Node) {
        d3.select(this)
          .transition()
          .duration(100)
          .attr('fill-opacity', arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0);
      });

    // Make them clickable
    path.on('click', clicked);

    // Add tooltips
    const format = d3.format(',d');
    path.append('title').text((d: D3Node) => {
      const ancestors = d
        .ancestors()
        .map((d: D3Node) => getNodeDisplayText(d.data))
        .reverse()
        .join(' / ');
      const value = d.value || 0;
      const metadata = d.data.metadata;
      let tooltip = `${ancestors}\nValue: ${format(value)}`;

      if (metadata?.description) {
        tooltip += `\nDescription: ${metadata.description}`;
      }
      if (metadata?.durationMs) {
        tooltip += `\nDuration: ${metadata.durationMs}ms`;
      }
      if (metadata?.tags && metadata.tags.length > 0) {
        tooltip += `\nTags: ${metadata.tags.join(', ')}`;
      }

      return tooltip;
    });

    // Add labels
    const label = svg
      .append('g')
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'middle')
      .style('user-select', 'none')
      .selectAll('text')
      .data(root.descendants().slice(1))
      .join('text')
      .attr('dy', '0.35em')
      .attr('fill-opacity', (d: D3Node) => +labelVisible(d.current))
      .attr('transform', (d: D3Node) => labelTransform(d.current))
      .text((d: D3Node) => d.data.name);

    // Add center circle for zooming out with reduced radius for better space utilization
    const parent = svg
      .append('circle')
      .datum(root)
      .attr('r', radius * 0.8) // Smaller center circle for more chart space
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('click', clicked);

    // Handle zoom on click
    function clicked(event: MouseEvent, p: D3Node) {
      if (onNodeClick) {
        onNodeClick(p.data);
      }
      setSelectedNode(p.data);

      // Update focus depth for dynamic visibility
      // When clicking center circle (p === root), zoom out to parent or root
      if (p === root || !p.parent) {
        focusDepth = 0;
        p = root;
      } else {
        focusDepth = p.depth;
      }

      parent.datum(p.parent || root);

      root.each((d: D3Node) => {
        d.target = {
          x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          y0: Math.max(0, d.y0 - p.depth),
          y1: Math.max(0, d.y1 - p.depth),
        };
      });

      const duration = event.altKey ? 7500 : 750;

      // Transition the data on all arcs, even the ones that aren't visible,
      // so that if this transition is interrupted, entering arcs will start
      // the next transition from the desired position.
      const pathTransition = path
        .transition()
        .duration(duration)
        .tween('data', (d: D3Node) => {
          const i = d3.interpolate(d.current, d.target);
          return (t: number) => (d.current = i(t));
        });

      pathTransition
        .filter(function (d: D3Node) {
          const element = this as SVGPathElement;
          return Boolean(+element.getAttribute('fill-opacity')! || arcVisible(d.target));
        })
        .attr('fill-opacity', (d: D3Node) => (arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0))
        .attr('pointer-events', (d: D3Node) => (arcVisible(d.target) ? 'auto' : 'none'))
        .attrTween('d', (d: D3Node) => () => arc(d.current) || '');

      const labelTransition = label
        .filter(function (d: D3Node) {
          const element = this as SVGTextElement;
          return Boolean(+element.getAttribute('fill-opacity')! || labelVisible(d.target));
        })
        .transition()
        .duration(duration);

      labelTransition
        .attr('fill-opacity', (d: D3Node) => +labelVisible(d.target))
        .attrTween('transform', (d: D3Node) => () => labelTransform(d.current));
    }
  }, [data, width, height, onNodeClick]);

  return (
    <div className="sunburst-container">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      {selectedNode && (
        <div
          className="selected-node-info"
          style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0', color: '#495057' }}>
            Selected: {getNodeDisplayText(selectedNode)}
          </h3>
          <div style={{ fontSize: '14px', color: '#6c757d' }}>
            <p>
              <strong>Type:</strong> {selectedNode.type}
            </p>
            {selectedNode.id && (
              <p>
                <strong>ID:</strong> {selectedNode.id}
              </p>
            )}
            {selectedNode.status && (
              <p>
                <strong>Status:</strong> {selectedNode.status}
              </p>
            )}
            {selectedNode.metadata?.description && (
              <p>
                <strong>Description:</strong> {selectedNode.metadata.description}
              </p>
            )}
            {selectedNode.metadata?.durationMs && (
              <p>
                <strong>Duration:</strong> {selectedNode.metadata.durationMs}ms
              </p>
            )}
            {selectedNode.metadata?.tags && selectedNode.metadata.tags.length > 0 && (
              <p>
                <strong>Tags:</strong> {selectedNode.metadata.tags.join(', ')}
              </p>
            )}
            {selectedNode.metadata?.createdAt && (
              <p>
                <strong>Created:</strong>{' '}
                {new Date(selectedNode.metadata.createdAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ZoomableSunburst;
