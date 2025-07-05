import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveScatterPlot } from '@nivo/scatterplot';
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  Calendar,
  Hash,
  Type,
  Filter,
  Play,
  Save,
  Download,
  Sparkles,
  Info,
  Eye,
  Share,
  RefreshCw,
} from 'lucide-react';
import { dbLogger as logger } from '../../logging/logger';
import styles from '../../styles/charts/ModernVisualizationPlayground.module.css';

interface Field {
  key: string;
  label: string;
  type: 'number' | 'string' | 'date';
  aggregations: string[];
  description?: string;
  icon: React.ReactNode;
}

interface ChartRecommendation {
  type: string;
  name: string;
  description: string;
  score: number;
  icon: React.ReactNode;
  bestFor: string[];
}

interface DraggedField {
  id: string;
  field: Field;
  aggregation?: string;
}

// Enhanced chart data interface
interface ChartDataPoint {
  [key: string]: string | number;
}

const AVAILABLE_FIELDS: Field[] = [
  {
    key: 'results.summary.tests',
    label: 'Total Tests',
    type: 'number',
    aggregations: ['sum', 'avg', 'count', 'max', 'min'],
    description: 'Total number of tests executed',
    icon: <Hash className="w-4 h-4" />,
  },
  {
    key: 'results.summary.passed',
    label: 'Passed Tests',
    type: 'number',
    aggregations: ['sum', 'avg', 'count', 'max', 'min'],
    description: 'Number of tests that passed successfully',
    icon: <Hash className="w-4 h-4" />,
  },
  {
    key: 'results.summary.failed',
    label: 'Failed Tests',
    type: 'number',
    aggregations: ['sum', 'avg', 'count', 'max', 'min'],
    description: 'Number of tests that failed',
    icon: <Hash className="w-4 h-4" />,
  },
  {
    key: 'results.summary.skipped',
    label: 'Skipped Tests',
    type: 'number',
    aggregations: ['sum', 'avg', 'count', 'max', 'min'],
    description: 'Number of tests that were skipped',
    icon: <Hash className="w-4 h-4" />,
  },
  {
    key: 'results.tool.name',
    label: 'Test Tool',
    type: 'string',
    aggregations: ['count', 'cardinality'],
    description: 'Testing framework or tool used',
    icon: <Type className="w-4 h-4" />,
  },
  {
    key: 'results.environment.testEnvironment',
    label: 'Environment',
    type: 'string',
    aggregations: ['count', 'cardinality'],
    description: 'Test execution environment',
    icon: <Type className="w-4 h-4" />,
  },
  {
    key: 'results.environment.branchName',
    label: 'Branch',
    type: 'string',
    aggregations: ['count', 'cardinality'],
    description: 'Git branch name',
    icon: <Type className="w-4 h-4" />,
  },
  {
    key: 'timestamp',
    label: 'Execution Time',
    type: 'date',
    aggregations: ['count'],
    description: 'When the test was executed',
    icon: <Calendar className="w-4 h-4" />,
  },
  {
    key: 'results.tests.duration',
    label: 'Test Duration',
    type: 'number',
    aggregations: ['sum', 'avg', 'count', 'max', 'min'],
    description: 'Duration of test execution in milliseconds',
    icon: <Hash className="w-4 h-4" />,
  },
  {
    key: 'results.tests.status',
    label: 'Test Status',
    type: 'string',
    aggregations: ['count', 'cardinality'],
    description: 'Individual test result status',
    icon: <Type className="w-4 h-4" />,
  },
  {
    key: 'results.tests.suite',
    label: 'Test Suite',
    type: 'string',
    aggregations: ['count', 'cardinality'],
    description: 'Test suite or group name',
    icon: <Type className="w-4 h-4" />,
  },
];

const CHART_TYPES = [
  {
    type: 'line',
    name: 'Line Chart',
    icon: <LineChart className="w-5 h-5" />,
    description: 'Show trends over time',
    bestFor: ['time series', 'trends', 'continuous data'],
  },
  {
    type: 'bar',
    name: 'Bar Chart',
    icon: <BarChart className="w-5 h-5" />,
    description: 'Compare categories',
    bestFor: ['comparisons', 'categorical data', 'rankings'],
  },
  {
    type: 'pie',
    name: 'Pie Chart',
    icon: <PieChart className="w-5 h-5" />,
    description: 'Show proportions',
    bestFor: ['parts of whole', 'percentages', 'distributions'],
  },
  {
    type: 'scatter',
    name: 'Scatter Plot',
    icon: <ScatterChart className="w-5 h-5" />,
    description: 'Find correlations',
    bestFor: ['correlations', 'outliers', 'relationships'],
  },
];

// Draggable Field Component
function DraggableField({ field }: { field: Field }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: field.key,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={styles.draggableField}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className={styles.fieldIcon}>{field.icon}</div>
      <div className={styles.fieldInfo}>
        <div className={styles.fieldLabel}>{field.label}</div>
        <div className={styles.fieldType}>{field.type}</div>
      </div>
      <div title={field.description}>
        <Info className="w-4 h-4 text-gray-400" />
      </div>
    </motion.div>
  );
}

// Drop Zone Component
function DropZone({
  id,
  title,
  fields,
  onRemove,
  placeholder,
  multiple = false,
}: {
  id: string;
  title: string;
  fields: DraggedField[];
  onRemove: (id: string) => void;
  placeholder: string;
  multiple?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  return (
    <div ref={setNodeRef} className={`${styles.dropZone} ${isOver ? styles.droppable : ''}`}>
      <div className={styles.dropZoneHeader}>
        <h4>{title}</h4>
        {!multiple && fields.length > 0 && <span className={styles.badge}>1 field</span>}
        {multiple && fields.length > 0 && (
          <span className={styles.badge}>{fields.length} fields</span>
        )}
      </div>
      <div className={styles.dropZoneContent}>
        {fields.length === 0 ? (
          <div className={styles.placeholder}>{placeholder}</div>
        ) : (
          <div className={styles.droppedFields}>
            {fields.map(draggedField => (
              <motion.div
                key={draggedField.id}
                className={styles.droppedField}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <div className={styles.fieldIcon}>{draggedField.field.icon}</div>
                <span>{draggedField.field.label}</span>
                {draggedField.aggregation && (
                  <span className={styles.aggregationBadge}>{draggedField.aggregation}</span>
                )}
                <button
                  onClick={() => onRemove(draggedField.id)}
                  className={styles.removeButton}
                  aria-label={`Remove ${draggedField.field.label}`}
                >
                  ×
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ModernVisualizationPlayground() {
  const [xAxisFields, setXAxisFields] = useState<DraggedField[]>([]);
  const [yAxisFields, setYAxisFields] = useState<DraggedField[]>([]);
  const [filterFields, setFilterFields] = useState<DraggedField[]>([]);
  const [colorField, setColorField] = useState<DraggedField[]>([]);
  const [selectedChartType, setSelectedChartType] = useState<string>('line');
  const [recommendations, setRecommendations] = useState<ChartRecommendation[]>([]);
  const [showRecommendations] = useState(true);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedField, setDraggedField] = useState<Field | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Generate chart recommendations based on selected fields
  const generateRecommendations = useCallback(() => {
    const hasTimeField = xAxisFields.some(f => f.field.type === 'date');
    const hasNumericFields = yAxisFields.some(f => f.field.type === 'number');
    const hasCategoricalFields = [...xAxisFields, ...yAxisFields, ...colorField].some(
      f => f.field.type === 'string'
    );

    const recs: ChartRecommendation[] = [];

    if (hasTimeField && hasNumericFields) {
      recs.push({
        type: 'line',
        name: 'Line Chart',
        description: 'Perfect for showing trends over time',
        score: 95,
        icon: <LineChart className="w-4 h-4" />,
        bestFor: ['Time series analysis', 'Trend visualization'],
      });
    }

    if (hasCategoricalFields && hasNumericFields) {
      recs.push({
        type: 'bar',
        name: 'Bar Chart',
        description: 'Great for comparing categories',
        score: 90,
        icon: <BarChart className="w-4 h-4" />,
        bestFor: ['Category comparison', 'Rankings'],
      });
    }

    if (yAxisFields.length === 1 && hasCategoricalFields) {
      recs.push({
        type: 'pie',
        name: 'Pie Chart',
        description: 'Shows proportions of the whole',
        score: 80,
        icon: <PieChart className="w-4 h-4" />,
        bestFor: ['Part-to-whole relationships', 'Distribution'],
      });
    }

    if (yAxisFields.length >= 2) {
      recs.push({
        type: 'scatter',
        name: 'Scatter Plot',
        description: 'Find correlations between metrics',
        score: 85,
        icon: <ScatterChart className="w-4 h-4" />,
        bestFor: ['Correlation analysis', 'Outlier detection'],
      });
    }

    setRecommendations(recs.sort((a, b) => b.score - a.score));
  }, [xAxisFields, yAxisFields, colorField]);

  useEffect(() => {
    generateRecommendations();
  }, [generateRecommendations]);

  const handleDragStart = (event: DragStartEvent) => {
    const field = AVAILABLE_FIELDS.find(f => f.key === event.active.id);
    setDraggedField(field || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedField(null);

    if (!over) return;

    const field = AVAILABLE_FIELDS.find(f => f.key === active.id);
    if (!field) return;

    const draggedField: DraggedField = {
      id: `${field.key}-${Date.now()}`,
      field,
      aggregation: field.aggregations[0], // Default to first aggregation
    };

    switch (over.id) {
      case 'x-axis':
        setXAxisFields([draggedField]); // Only one field for X-axis
        break;
      case 'y-axis':
        setYAxisFields(prev => [...prev, draggedField]);
        break;
      case 'filters':
        setFilterFields(prev => [...prev, draggedField]);
        break;
      case 'color':
        setColorField([draggedField]); // Only one field for color
        break;
    }
  };

  // Execute query and fetch data
  const executeQuery = useCallback(async () => {
    if (xAxisFields.length === 0 || yAxisFields.length === 0) {
      setError('Please add at least one field to both X and Y axes');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // For demo purposes, generate realistic sample data
      // In a real implementation, this would call the OpenSearch API
      const sampleData: ChartDataPoint[] = [];
      const dataPoints = 20;

      for (let i = 0; i < dataPoints; i++) {
        const dataPoint: ChartDataPoint = {};

        // Add X-axis data
        if (xAxisFields[0]) {
          const xField = xAxisFields[0].field;
          if (xField.type === 'date') {
            dataPoint[xField.label] = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0];
          } else if (xField.type === 'string') {
            dataPoint[xField.label] = ['Production', 'Staging', 'Development'][i % 3];
          } else {
            dataPoint[xField.label] = i;
          }
        }

        // Add Y-axis data
        yAxisFields.forEach(yField => {
          const baseValue = 50 + Math.random() * 50;
          const trend = selectedChartType === 'line' ? i * 2 : 0;
          dataPoint[yField.field.label] = Math.floor(
            baseValue + trend + (Math.random() - 0.5) * 20
          );
        });

        // Add color field data
        if (colorField[0]) {
          const cField = colorField[0].field;
          if (cField.type === 'string') {
            dataPoint[cField.label] = ['Category A', 'Category B', 'Category C'][i % 3];
          }
        }

        sampleData.push(dataPoint);
      }

      setChartData(sampleData);
      logger.info('Query executed successfully', {
        dataPoints: sampleData.length,
        xAxis: xAxisFields.map(f => f.field.label),
        yAxis: yAxisFields.map(f => f.field.label),
        chartType: selectedChartType,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(errorMessage);
      logger.error('Failed to execute query', { error, chartType: selectedChartType });
    } finally {
      setLoading(false);
    }
  }, [xAxisFields, yAxisFields, colorField, selectedChartType]);

  // Render the appropriate chart based on selected type and data
  const renderChart = () => {
    if (!chartData.length) {
      return (
        <motion.div className={styles.emptyState} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Eye className={styles.emptyIcon} />
          <h3>Ready to visualize</h3>{' '}
          <p>Add fields and click &quot;Generate Visualization&quot; to see your chart</p>
        </motion.div>
      );
    }

    const chartProps = {
      data: chartData,
      height: 350,
      margin: { top: 20, right: 80, bottom: 60, left: 80 },
      colors: { scheme: 'category10' as const },
      animate: true,
      motionStiffness: 90,
      motionDamping: 15,
    };

    const xKey = xAxisFields[0]?.field.label || 'index';
    const yKeys = yAxisFields.map(f => f.field.label);

    switch (selectedChartType) {
      case 'bar':
        return (
          <ResponsiveBar
            {...chartProps}
            data={chartData}
            keys={yKeys}
            indexBy={xKey}
            padding={0.3}
            borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
            axisTop={null}
            axisRight={null}
            labelSkipWidth={12}
            labelSkipHeight={12}
            legends={[
              {
                dataFrom: 'keys',
                anchor: 'bottom-right',
                direction: 'column',
                justify: false,
                translateX: 120,
                translateY: 0,
                itemsSpacing: 2,
                itemWidth: 100,
                itemHeight: 20,
                itemDirection: 'left-to-right',
                itemOpacity: 0.85,
                symbolSize: 20,
              },
            ]}
          />
        );

      case 'line':
        return (
          <ResponsiveLine
            {...chartProps}
            data={yKeys.map(key => ({
              id: key,
              data: chartData.map(item => ({
                x: item[xKey],
                y: item[key] || 0,
              })),
            }))}
            curve="cardinal"
            enableGridX={false}
            enableGridY={true}
            pointSize={8}
            pointBorderWidth={2}
            pointBorderColor={{ from: 'serieColor' }}
            enableArea={false}
            legends={[
              {
                anchor: 'bottom-right',
                direction: 'column',
                justify: false,
                translateX: 100,
                translateY: 0,
                itemsSpacing: 0,
                itemDirection: 'left-to-right',
                itemWidth: 80,
                itemHeight: 20,
                itemOpacity: 0.75,
                symbolSize: 12,
                symbolShape: 'circle',
              },
            ]}
          />
        );

      case 'pie': {
        const pieData = chartData.slice(0, 8).map((item, index) => ({
          id: String(item[xKey] || `Item ${index + 1}`),
          value: Number(item[yKeys[0]] || 0),
        }));

        return (
          <ResponsivePie
            data={pieData}
            margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
            innerRadius={0.5}
            padAngle={0.7}
            cornerRadius={3}
            activeOuterRadiusOffset={8}
            colors={{ scheme: 'category10' }}
            borderWidth={1}
            borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
            arcLinkLabelsSkipAngle={10}
            arcLinkLabelsTextColor="#333333"
            arcLinkLabelsThickness={2}
            arcLinkLabelsColor={{ from: 'color' }}
            arcLabelsSkipAngle={10}
            arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
            legends={[
              {
                anchor: 'bottom',
                direction: 'row',
                justify: false,
                translateX: 0,
                translateY: 56,
                itemsSpacing: 0,
                itemWidth: 100,
                itemHeight: 18,
                itemTextColor: '#999',
                itemDirection: 'left-to-right',
                itemOpacity: 1,
                symbolSize: 18,
                symbolShape: 'circle',
              },
            ]}
          />
        );
      }

      case 'scatter': {
        const scatterData = [
          {
            id: 'data',
            data: chartData.map(item => ({
              x: Number(item[yKeys[0]] || 0),
              y: Number(item[yKeys[1]] || item[yKeys[0]] || 0),
            })),
          },
        ];

        return (
          <ResponsiveScatterPlot
            data={scatterData}
            margin={{ top: 60, right: 140, bottom: 70, left: 90 }}
            xScale={{ type: 'linear', min: 'auto', max: 'auto' }}
            yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
            colors={{ scheme: 'category10' }}
            nodeSize={8}
            axisTop={null}
            axisRight={null}
            legends={[
              {
                anchor: 'bottom-right',
                direction: 'column',
                justify: false,
                translateX: 130,
                translateY: 0,
                itemWidth: 100,
                itemHeight: 12,
                itemsSpacing: 5,
                itemDirection: 'left-to-right',
                symbolSize: 12,
                symbolShape: 'circle',
              },
            ]}
          />
        );
      }

      default:
        return (
          <div className={styles.emptyState}>
            <p>Unsupported chart type: {selectedChartType}</p>
          </div>
        );
    }
  };

  const removeField = (type: string, id: string) => {
    switch (type) {
      case 'x-axis':
        setXAxisFields(prev => prev.filter(f => f.id !== id));
        break;
      case 'y-axis':
        setYAxisFields(prev => prev.filter(f => f.id !== id));
        break;
      case 'filters':
        setFilterFields(prev => prev.filter(f => f.id !== id));
        break;
      case 'color':
        setColorField(prev => prev.filter(f => f.id !== id));
        break;
    }
  };

  return (
    <div className={styles.playground}>
      <div className={styles.header}>
        <motion.h1
          className={styles.title}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Sparkles className="w-8 h-8" />
          Smart Analytics Studio
        </motion.h1>
        <p className={styles.subtitle}>
          Create stunning visualizations with our intelligent query builder
        </p>
      </div>

      <div className={styles.content}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Field Palette */}
          <motion.div
            className={styles.fieldPalette}
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h3 className={styles.sectionTitle}>
              <Hash className="w-5 h-5" />
              Available Fields
            </h3>
            <div className={styles.fieldList}>
              <SortableContext
                items={AVAILABLE_FIELDS.map(f => f.key)}
                strategy={verticalListSortingStrategy}
              >
                {AVAILABLE_FIELDS.map(field => (
                  <DraggableField key={field.key} field={field} />
                ))}
              </SortableContext>
            </div>
          </motion.div>

          {/* Query Builder */}
          <motion.div
            className={styles.queryBuilder}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h3 className={styles.sectionTitle}>
              <Filter className="w-5 h-5" />
              Build Your Visualization
            </h3>
            <div className={styles.dropZones}>
              <DropZone
                id="x-axis"
                title="X-Axis (Time/Category)"
                fields={xAxisFields}
                onRemove={id => removeField('x-axis', id)}
                placeholder="Drag a date or category field here"
              />

              <DropZone
                id="y-axis"
                title="Y-Axis (Metrics)"
                fields={yAxisFields}
                onRemove={id => removeField('y-axis', id)}
                placeholder="Drag numeric fields here"
                multiple
              />

              <DropZone
                id="color"
                title="Color By (Optional)"
                fields={colorField}
                onRemove={id => removeField('color', id)}
                placeholder="Drag a field to group by color"
              />

              <DropZone
                id="filters"
                title="Filters (Optional)"
                fields={filterFields}
                onRemove={id => removeField('filters', id)}
                placeholder="Drag fields to filter data"
                multiple
              />
            </div>

            {/* Chart Type Selector */}
            <div className={styles.chartTypeSelector}>
              <h4>Chart Type</h4>
              {showRecommendations && recommendations.length > 0 && (
                <motion.div
                  className={styles.recommendations}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <div className={styles.recommendationHeader}>
                    <Sparkles className="w-4 h-4" />
                    <span>Recommended for your data</span>
                  </div>
                  <div className={styles.recommendationList}>
                    {recommendations.slice(0, 2).map(rec => (
                      <motion.button
                        key={rec.type}
                        className={`${styles.chartTypeButton} ${styles.recommended} ${
                          selectedChartType === rec.type ? styles.selected : ''
                        }`}
                        onClick={() => setSelectedChartType(rec.type)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {rec.icon}
                        <div className={styles.chartTypeInfo}>
                          <span className={styles.chartTypeName}>{rec.name}</span>
                          <span className={styles.chartTypeDescription}>{rec.description}</span>
                        </div>
                        <div className={styles.scoreBar}>
                          <div className={styles.score} style={{ width: `${rec.score}%` }} />
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              <div className={styles.allChartTypes}>
                {CHART_TYPES.map(chartType => (
                  <motion.button
                    key={chartType.type}
                    className={`${styles.chartTypeButton} ${
                      selectedChartType === chartType.type ? styles.selected : ''
                    }`}
                    onClick={() => setSelectedChartType(chartType.type)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {chartType.icon}
                    <div className={styles.chartTypeInfo}>
                      <span className={styles.chartTypeName}>{chartType.name}</span>
                      <span className={styles.chartTypeDescription}>{chartType.description}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className={styles.actions}>
              <motion.button
                className={styles.primaryButton}
                disabled={xAxisFields.length === 0 || yAxisFields.length === 0 || loading}
                onClick={executeQuery}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Generate Visualization
                  </>
                )}
              </motion.button>

              <motion.button
                className={styles.secondaryButton}
                disabled={chartData.length === 0}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Save className="w-4 h-4" />
                Save to Dashboard
              </motion.button>

              <motion.button
                className={styles.secondaryButton}
                disabled={chartData.length === 0}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Share className="w-4 h-4" />
                Share
              </motion.button>

              <motion.button
                className={styles.secondaryButton}
                disabled={chartData.length === 0}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Download className="w-4 h-4" />
                Export
              </motion.button>
            </div>
          </motion.div>

          <DragOverlay>
            {draggedField ? (
              <motion.div
                className={styles.dragOverlay}
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <div className={styles.fieldIcon}>{draggedField.icon}</div>
                <span>{draggedField.label}</span>
              </motion.div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Preview Area */}
        <motion.div
          className={styles.previewArea}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <h3 className={styles.sectionTitle}>
            <Eye className="w-5 h-5" />
            Live Preview
          </h3>
          <div className={styles.chartPreview}>
            <AnimatePresence mode="wait">
              {error ? (
                <motion.div
                  key="error"
                  className={styles.errorState}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <p className={styles.errorMessage}>{error}</p>
                  <motion.button
                    className={styles.retryButton}
                    onClick={() => setError(null)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                  </motion.button>
                </motion.div>
              ) : loading ? (
                <motion.div
                  key="loading"
                  className={styles.loadingState}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                  <p>Analyzing your data...</p>
                </motion.div>
              ) : (
                <motion.div
                  key="chart"
                  className={styles.chartContainer}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  {renderChart()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
