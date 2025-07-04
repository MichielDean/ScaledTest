import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  ScatterChart,
  Scatter,
} from 'recharts';
import { dbLogger as logger } from '../../logging/logger';
import styles from '../../styles/charts/VisualizationPlayground.module.css';

interface VisualizationPlaygroundProps {
  token?: string;
}

interface SavedVisualization {
  id: string;
  name: string;
  description: string;
  chartType: ChartType;
  dataQuery: string;
  chartConfig: ChartConfiguration;
  createdAt: string;
  updatedAt: string;
}

interface ChartConfiguration {
  xAxis: string;
  yAxis: string[];
  groupBy?: string;
  aggregation: 'sum' | 'avg' | 'count' | 'max' | 'min' | 'cardinality';
  timeRange: string;
  filters: Record<string, unknown>;
  colors?: string[];
  title: string;
}

type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'scatter';

interface QueryBuilderState {
  selectedFields: string[];
  aggregation: 'sum' | 'avg' | 'count' | 'max' | 'min' | 'cardinality';
  groupBy: string;
  timeRange: string;
  filters: Array<{
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'between';
    value: string;
  }>;
}

const CHART_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#ec4899',
  '#6b7280',
];

const AVAILABLE_FIELDS = [
  {
    key: 'results.summary.tests',
    label: 'Total Tests',
    type: 'number',
    aggregations: ['sum', 'avg', 'count', 'max', 'min'],
  },
  {
    key: 'results.summary.passed',
    label: 'Passed Tests',
    type: 'number',
    aggregations: ['sum', 'avg', 'count', 'max', 'min'],
  },
  {
    key: 'results.summary.failed',
    label: 'Failed Tests',
    type: 'number',
    aggregations: ['sum', 'avg', 'count', 'max', 'min'],
  },
  {
    key: 'results.summary.skipped',
    label: 'Skipped Tests',
    type: 'number',
    aggregations: ['sum', 'avg', 'count', 'max', 'min'],
  },
  {
    key: 'results.tool.name',
    label: 'Test Tool',
    type: 'string',
    aggregations: ['count', 'cardinality'],
  },
  {
    key: 'results.environment.testEnvironment',
    label: 'Environment',
    type: 'string',
    aggregations: ['count', 'cardinality'],
  },
  {
    key: 'results.environment.branchName',
    label: 'Branch',
    type: 'string',
    aggregations: ['count', 'cardinality'],
  },
  { key: 'timestamp', label: 'Execution Time', type: 'date', aggregations: ['count'] },
  {
    key: 'results.tests.duration',
    label: 'Test Duration',
    type: 'number',
    aggregations: ['sum', 'avg', 'count', 'max', 'min'],
  },
  {
    key: 'results.tests.status',
    label: 'Test Status',
    type: 'string',
    aggregations: ['count', 'cardinality'],
  },
  {
    key: 'results.tests.suite',
    label: 'Test Suite',
    type: 'string',
    aggregations: ['count', 'cardinality'],
  },
];

const VisualizationPlayground: React.FC<VisualizationPlaygroundProps> = ({ token }) => {
  const [activeTab, setActiveTab] = useState<'builder' | 'saved' | 'dashboards'>('builder');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [queryBuilder, setQueryBuilder] = useState<QueryBuilderState>({
    selectedFields: ['results.summary.tests'],
    aggregation: 'sum',
    groupBy: 'timestamp',
    timeRange: '7d',
    filters: [],
  });
  const [chartData, setChartData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVisualizations, setSavedVisualizations] = useState<SavedVisualization[]>([]);
  const [currentVisualization, setCurrentVisualization] = useState<Partial<SavedVisualization>>({
    name: '',
    description: '',
    chartType: 'line',
    chartConfig: {
      xAxis: 'timestamp',
      yAxis: ['results.summary.tests'],
      aggregation: 'sum',
      timeRange: '7d',
      filters: {},
      title: 'Custom Visualization',
    },
  });

  // Load saved visualizations from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('scaledtest-visualizations');
    if (saved) {
      try {
        setSavedVisualizations(JSON.parse(saved));
      } catch (error) {
        logger.error('Failed to load saved visualizations', { error });
      }
    }
  }, []);

  // Save visualizations to localStorage
  const saveVisualizationsToStorage = useCallback((visualizations: SavedVisualization[]) => {
    localStorage.setItem('scaledtest-visualizations', JSON.stringify(visualizations));
    setSavedVisualizations(visualizations);
  }, []);

  // Execute query against OpenSearch
  const executeQuery = useCallback(async () => {
    if (!token) {
      setError('Authentication required to query data');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      // Map UI aggregation types to OpenSearch aggregation types
      const getOpenSearchAggregation = (aggregationType: string) => {
        const aggregationMap: Record<string, string> = {
          count: 'value_count',
          sum: 'sum',
          avg: 'avg',
          max: 'max',
          min: 'min',
          cardinality: 'cardinality',
        };

        const mappedAggregation = aggregationMap[aggregationType];
        if (!mappedAggregation) {
          logger.warn('Unknown aggregation type, using default', {
            requestedType: aggregationType,
            defaultType: 'value_count',
          });
          return 'value_count';
        }

        return mappedAggregation;
      };

      // Validate aggregation compatibility with selected fields
      const validateAggregationCompatibility = () => {
        const incompatibleFields = queryBuilder.selectedFields.filter(fieldKey => {
          const field = AVAILABLE_FIELDS.find(f => f.key === fieldKey);
          return field && !field.aggregations.includes(queryBuilder.aggregation);
        });

        if (incompatibleFields.length > 0) {
          const fieldLabels = incompatibleFields
            .map(fieldKey => AVAILABLE_FIELDS.find(f => f.key === fieldKey)?.label || fieldKey)
            .join(', ');
          throw new Error(
            `Aggregation "${queryBuilder.aggregation}" is not compatible with field(s): ${fieldLabels}. Please select a different aggregation or remove these fields.`
          );
        }
      };

      // Validate before building query
      validateAggregationCompatibility();

      // Build OpenSearch query based on queryBuilder state
      const opensearchQuery = {
        size: 0,
        query: {
          bool: {
            must: [
              {
                range: {
                  timestamp: {
                    gte: `now-${queryBuilder.timeRange}`,
                  },
                },
              },
              ...queryBuilder.filters.map(filter => ({
                [filter.operator === 'equals' ? 'term' : 'wildcard']: {
                  [filter.field]: filter.operator === 'equals' ? filter.value : `*${filter.value}*`,
                },
              })),
            ],
          },
        },
        aggs: {
          time_buckets: {
            date_histogram: {
              field: 'timestamp',
              calendar_interval: queryBuilder.timeRange === '1d' ? 'hour' : 'day',
            },
            aggs: Object.fromEntries(
              queryBuilder.selectedFields.map(field => [
                field.replace(/\./g, '_'),
                {
                  [getOpenSearchAggregation(queryBuilder.aggregation)]: {
                    field: field,
                  },
                },
              ])
            ),
          },
        },
      };

      const response = await fetch('/api/opensearch/custom-query', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: opensearchQuery }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Query failed (${response.status}): ${errorText || response.statusText}`);
      }

      const result = await response.json();

      // Check if the response indicates success
      if (!result.success) {
        throw new Error(result.error || 'Query execution failed');
      }

      // Transform OpenSearch response to chart data
      const transformedData =
        result.data?.aggregations?.time_buckets?.buckets?.map((bucket: unknown) => {
          const item: Record<string, unknown> = {
            timestamp: new Date((bucket as { key: number }).key).toISOString(),
          };

          queryBuilder.selectedFields.forEach(field => {
            const fieldKey = field.replace(/\./g, '_');
            item[field] = (bucket as Record<string, { value: number }>)[fieldKey]?.value || 0;
          });

          return item;
        }) || [];

      setChartData(transformedData);

      if (transformedData.length === 0) {
        setError(
          'No data found for the selected time range and filters. Try expanding your time range or adjusting your filters.'
        );
      }

      logger.info('Custom query executed successfully', {
        dataPoints: transformedData.length,
        fields: queryBuilder.selectedFields,
        aggregationType: queryBuilder.aggregation,
      });
    } catch (error) {
      let errorMessage = 'Unknown error occurred';

      if (error instanceof Error) {
        errorMessage = error.message;

        // Provide more user-friendly error messages for common issues
        if (errorMessage.includes('parsing_exception')) {
          errorMessage = 'Invalid query format. Please check your field selections and try again.';
        } else if (errorMessage.includes('index_not_found_exception')) {
          errorMessage = 'No test data found. Please ensure test reports have been uploaded.';
        } else if (errorMessage.includes('timeout')) {
          errorMessage = 'Query timed out. Try reducing the time range or simplifying your query.';
        }
      }

      setError(errorMessage);
      logger.error('Failed to execute custom query', { error, queryBuilder });
    } finally {
      setLoading(false);
    }
  }, [token, queryBuilder]);

  // Save current visualization
  const saveVisualization = useCallback(() => {
    if (!currentVisualization.name) {
      setError('Please provide a name for your visualization');
      return;
    }

    const newVisualization: SavedVisualization = {
      id: Date.now().toString(),
      name: currentVisualization.name,
      description: currentVisualization.description || '',
      chartType,
      dataQuery: JSON.stringify(queryBuilder),
      chartConfig: {
        xAxis: queryBuilder.groupBy,
        yAxis: queryBuilder.selectedFields,
        aggregation: queryBuilder.aggregation,
        timeRange: queryBuilder.timeRange,
        filters: Object.fromEntries(queryBuilder.filters.map(f => [f.field, f.value])),
        title: currentVisualization.name,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...savedVisualizations, newVisualization];
    saveVisualizationsToStorage(updated);

    logger.info('Visualization saved', { name: newVisualization.name, id: newVisualization.id });
    setCurrentVisualization({ ...currentVisualization, name: '', description: '' });
  }, [
    currentVisualization,
    chartType,
    queryBuilder,
    savedVisualizations,
    saveVisualizationsToStorage,
  ]);

  // Load saved visualization
  const loadVisualization = useCallback((visualization: SavedVisualization) => {
    setChartType(visualization.chartType);
    setQueryBuilder(JSON.parse(visualization.dataQuery));
    setCurrentVisualization(visualization);
    setActiveTab('builder');
  }, []);

  // Delete saved visualization
  const deleteVisualization = useCallback(
    (id: string) => {
      const updated = savedVisualizations.filter(v => v.id !== id);
      saveVisualizationsToStorage(updated);
      logger.info('Visualization deleted', { id });
    },
    [savedVisualizations, saveVisualizationsToStorage]
  );

  // Add filter
  const addFilter = useCallback(() => {
    setQueryBuilder(prev => ({
      ...prev,
      filters: [...prev.filters, { field: 'results.tool.name', operator: 'equals', value: '' }],
    }));
  }, []);

  // Remove filter
  const removeFilter = useCallback((index: number) => {
    setQueryBuilder(prev => ({
      ...prev,
      filters: prev.filters.filter((_, i) => i !== index),
    }));
  }, []);

  // Update filter
  const updateFilter = useCallback(
    (index: number, field: keyof (typeof queryBuilder.filters)[0], value: string) => {
      setQueryBuilder(prev => ({
        ...prev,
        filters: prev.filters.map((filter, i) =>
          i === index ? { ...filter, [field]: value } : filter
        ),
      }));
    },
    [queryBuilder]
  );
  // Render chart based on type
  const renderChart = (): React.ReactElement => {
    if (chartData.length === 0) {
      return (
        <div className={styles.noDataMessage}>
          <p>
            No data to display. Configure your query and click &quot;Execute Query&quot; to generate
            a visualization.
          </p>
        </div>
      );
    }

    const chartProps = {
      data: chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 5 },
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" />
            <YAxis />
            <Tooltip />
            <Legend />
            {queryBuilder.selectedFields.map((field, index) => (
              <Line
                key={field}
                type="monotone"
                dataKey={field}
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" />
            <YAxis />
            <Tooltip />
            <Legend />
            {queryBuilder.selectedFields.map((field, index) => (
              <Bar key={field} dataKey={field} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </BarChart>
        );

      case 'area':
        return (
          <AreaChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" />
            <YAxis />
            <Tooltip />
            <Legend />
            {queryBuilder.selectedFields.map((field, index) => (
              <Area
                key={field}
                type="monotone"
                dataKey={field}
                stackId="1"
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </AreaChart>
        );

      case 'pie': {
        // For pie charts, we'll show the latest data point
        const latestData = chartData[chartData.length - 1] as Record<string, number>;
        const pieData = queryBuilder.selectedFields.map((field, index) => ({
          name: AVAILABLE_FIELDS.find(f => f.key === field)?.label || field,
          value: latestData[field] || 0,
          fill: CHART_COLORS[index % CHART_COLORS.length],
        }));

        return (
          <PieChart {...chartProps}>
            <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value">
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        );
      }

      case 'scatter':
        return (
          <ScatterChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" />
            <YAxis />
            <Tooltip />
            <Legend />
            {queryBuilder.selectedFields.map((field, index) => (
              <Scatter
                key={field}
                dataKey={field}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </ScatterChart>
        );
      default:
        return (
          <div className={styles.noDataMessage}>
            <p>Unsupported chart type</p>
          </div>
        );
    }
  };

  return (
    <div className={styles.playground}>
      <div className={styles.header}>
        <h2 id="visualization-playground-title">🎨 Visualization Playground</h2>
        <p className={styles.description}>
          Create custom visualizations from your CTRF test data using OpenSearch queries
        </p>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabNavigation}>
        <button
          id="builder-tab"
          className={`${styles.tab} ${activeTab === 'builder' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('builder')}
        >
          📊 Query Builder
        </button>
        <button
          id="saved-tab"
          className={`${styles.tab} ${activeTab === 'saved' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('saved')}
        >
          💾 Saved Visualizations ({savedVisualizations.length})
        </button>
        <button
          id="dashboards-tab"
          className={`${styles.tab} ${activeTab === 'dashboards' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('dashboards')}
        >
          🌐 OpenSearch Dashboards
        </button>
      </div>

      {/* Builder Tab */}
      {activeTab === 'builder' && (
        <div className={styles.builderContent}>
          <div className={styles.queryBuilder}>
            <div className={styles.section}>
              <h3>Chart Configuration</h3>

              <div className={styles.formGroup}>
                <label htmlFor="chart-type-select">Chart Type:</label>
                <select
                  id="chart-type-select"
                  value={chartType}
                  onChange={e => setChartType(e.target.value as ChartType)}
                  className={styles.select}
                >
                  <option value="line">Line Chart</option>
                  <option value="bar">Bar Chart</option>
                  <option value="area">Area Chart</option>
                  <option value="pie">Pie Chart</option>
                  <option value="scatter">Scatter Plot</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="aggregation-select">Aggregation:</label>
                <select
                  id="aggregation-select"
                  value={queryBuilder.aggregation}
                  onChange={e =>
                    setQueryBuilder(prev => ({
                      ...prev,
                      aggregation: e.target.value as typeof prev.aggregation,
                    }))
                  }
                  className={styles.select}
                >
                  {(() => {
                    // Get available aggregations based on selected fields
                    const getAvailableAggregations = () => {
                      if (queryBuilder.selectedFields.length === 0) {
                        return ['sum', 'avg', 'count', 'max', 'min']; // All options when no fields selected
                      }

                      const fieldAggregations = queryBuilder.selectedFields.map(fieldKey => {
                        const field = AVAILABLE_FIELDS.find(f => f.key === fieldKey);
                        return field?.aggregations || ['count'];
                      });

                      // Return intersection of all field aggregations
                      return fieldAggregations.reduce((acc, current) =>
                        acc.filter(agg => current.includes(agg))
                      );
                    };

                    const availableAggregations = getAvailableAggregations();
                    const aggregationLabels = {
                      sum: 'Sum',
                      avg: 'Average',
                      count: 'Count',
                      max: 'Maximum',
                      min: 'Minimum',
                    };

                    return availableAggregations.map(agg => (
                      <option key={agg} value={agg}>
                        {aggregationLabels[agg as keyof typeof aggregationLabels]}
                      </option>
                    ));
                  })()}
                </select>
                {queryBuilder.selectedFields.length > 0 &&
                  (() => {
                    const fieldAggregations = queryBuilder.selectedFields.map(fieldKey => {
                      const field = AVAILABLE_FIELDS.find(f => f.key === fieldKey);
                      return field?.aggregations || ['count'];
                    });
                    const availableAggregations = fieldAggregations.reduce((acc, current) =>
                      acc.filter(agg => current.includes(agg))
                    );

                    if (!availableAggregations.includes(queryBuilder.aggregation)) {
                      return (
                        <div className={styles.validationWarning}>
                          ⚠️ Current aggregation not compatible with selected fields
                        </div>
                      );
                    }
                    return null;
                  })()}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="time-range-select">Time Range:</label>
                <select
                  id="time-range-select"
                  value={queryBuilder.timeRange}
                  onChange={e => setQueryBuilder(prev => ({ ...prev, timeRange: e.target.value }))}
                  className={styles.select}
                >
                  <option value="1d">Last 1 day</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
              </div>
            </div>

            <div className={styles.section}>
              <h3>Data Fields</h3>
              <div className={styles.fieldSelector}>
                {AVAILABLE_FIELDS.map(field => (
                  <label key={field.key} className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={queryBuilder.selectedFields.includes(field.key)}
                      onChange={e => {
                        if (e.target.checked) {
                          setQueryBuilder(prev => ({
                            ...prev,
                            selectedFields: [...prev.selectedFields, field.key],
                          }));
                        } else {
                          setQueryBuilder(prev => ({
                            ...prev,
                            selectedFields: prev.selectedFields.filter(f => f !== field.key),
                          }));
                        }
                      }}
                    />
                    {field.label} <span className={styles.fieldType}>({field.type})</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3>Filters</h3>
                <button id="add-filter-button" onClick={addFilter} className={styles.addButton}>
                  + Add Filter
                </button>
              </div>

              {queryBuilder.filters.map((filter, index) => (
                <div key={index} className={styles.filterRow}>
                  <select
                    value={filter.field}
                    onChange={e => updateFilter(index, 'field', e.target.value)}
                    className={styles.select}
                  >
                    {AVAILABLE_FIELDS.map(field => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filter.operator}
                    onChange={e => updateFilter(index, 'operator', e.target.value)}
                    className={styles.select}
                  >
                    <option value="equals">Equals</option>
                    <option value="contains">Contains</option>
                    <option value="greater_than">Greater Than</option>
                    <option value="less_than">Less Than</option>
                  </select>

                  <input
                    type="text"
                    value={filter.value}
                    onChange={e => updateFilter(index, 'value', e.target.value)}
                    placeholder="Filter value"
                    className={styles.input}
                  />

                  <button
                    onClick={() => removeFilter(index)}
                    className={styles.removeButton}
                    aria-label={`Remove filter ${index + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.actions}>
              <button
                id="execute-query-button"
                onClick={executeQuery}
                disabled={loading || queryBuilder.selectedFields.length === 0}
                className={styles.executeButton}
              >
                {loading ? 'Executing...' : 'Execute Query'}
              </button>
            </div>
          </div>

          <div className={styles.visualization}>
            <div className={styles.chartHeader}>
              <h3>Preview</h3>
              {!loading && chartData.length > 0 && (
                <div className={styles.saveSection}>
                  <input
                    id="visualization-name-input"
                    type="text"
                    placeholder="Visualization name"
                    value={currentVisualization.name}
                    onChange={e =>
                      setCurrentVisualization(prev => ({ ...prev, name: e.target.value }))
                    }
                    className={styles.input}
                  />
                  <input
                    id="visualization-description-input"
                    type="text"
                    placeholder="Description (optional)"
                    value={currentVisualization.description}
                    onChange={e =>
                      setCurrentVisualization(prev => ({ ...prev, description: e.target.value }))
                    }
                    className={styles.input}
                  />
                  <button
                    id="save-visualization-button"
                    onClick={saveVisualization}
                    className={styles.saveButton}
                  >
                    💾 Save Visualization
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className={styles.error}>
                <p>Error: {error}</p>
              </div>
            )}

            {loading && (
              <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <p>Executing query...</p>
              </div>
            )}

            <div className={styles.chartContainer}>
              <ResponsiveContainer width="100%" height={400}>
                {renderChart()}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Saved Visualizations Tab */}
      {activeTab === 'saved' && (
        <div className={styles.savedContent}>
          <h3>Your Saved Visualizations</h3>
          {savedVisualizations.length === 0 ? (
            <div className={styles.emptyState}>
              <p>
                No saved visualizations yet. Create your first visualization in the Query Builder!
              </p>
            </div>
          ) : (
            <div className={styles.visualizationGrid}>
              {savedVisualizations.map(viz => (
                <div key={viz.id} className={styles.visualizationCard}>
                  <div className={styles.cardHeader}>
                    <h4>{viz.name}</h4>
                    <div className={styles.cardActions}>
                      <button
                        onClick={() => loadVisualization(viz)}
                        className={styles.loadButton}
                        aria-label={`Load visualization ${viz.name}`}
                      >
                        📊 Load
                      </button>
                      <button
                        onClick={() => deleteVisualization(viz.id)}
                        className={styles.deleteButton}
                        aria-label={`Delete visualization ${viz.name}`}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                  <p className={styles.cardDescription}>{viz.description}</p>
                  <div className={styles.cardMeta}>
                    <div className={styles.chartTypeBadge}>
                      {viz.chartType.charAt(0).toUpperCase() + viz.chartType.slice(1)} Chart
                    </div>
                    <div className={styles.cardDate}>
                      Created: {new Date(viz.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* OpenSearch Dashboards Tab */}
      {activeTab === 'dashboards' && (
        <div className={styles.dashboardsContent}>
          <h3>OpenSearch Dashboards Integration</h3>
          <p className={styles.dashboardDescription}>
            OpenSearch Dashboards provides advanced visualization capabilities with your CTRF data.
            Access the full-featured dashboard environment for complex analytics and custom
            dashboards.
          </p>

          <div className={styles.dashboardFeatures}>
            <div className={styles.feature}>
              <h4>🎨 Advanced Visualizations</h4>
              <p>
                Create complex charts, heatmaps, and custom visualizations with drag-and-drop
                interface
              </p>
            </div>
            <div className={styles.feature}>
              <h4>📊 Interactive Dashboards</h4>
              <p>
                Build comprehensive dashboards with multiple visualizations and real-time filtering
              </p>
            </div>
            <div className={styles.feature}>
              <h4>🔍 Advanced Analytics</h4>
              <p>
                Perform complex aggregations, time-series analysis, and statistical calculations
              </p>
            </div>
            <div className={styles.feature}>
              <h4>🤝 Share & Collaborate</h4>
              <p>Share dashboards with your team and embed visualizations in other applications</p>
            </div>
          </div>

          <div className={styles.dashboardActions}>
            <button
              id="open-dashboards-button"
              onClick={() => window.open('http://localhost:5601', '_blank')}
              className={styles.dashboardButton}
            >
              🌐 Open OpenSearch Dashboards
            </button>{' '}
            <button
              id="setup-index-button"
              onClick={async () => {
                try {
                  const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                  };

                  if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                  }

                  const response = await fetch('/api/opensearch/setup-dashboards', {
                    method: 'POST',
                    headers,
                  });

                  const result = await response.json();

                  if (result.success) {
                    logger.info('OpenSearch Dashboards setup initiated', result);
                    alert('Setup information provided. Check the browser console for details.');
                  } else {
                    logger.error('Failed to setup dashboards', { error: result.error });
                    alert(`Setup failed: ${result.error}`);
                  }
                } catch (error) {
                  logger.error('Error setting up dashboards', { error });
                  alert('Failed to communicate with setup service');
                }
              }}
              className={styles.setupButton}
            >
              ⚙️ Setup CTRF Index Pattern
            </button>
          </div>

          <div className={styles.helpSection}>
            <h4>Getting Started with OpenSearch Dashboards</h4>
            <ol className={styles.instructions}>
              <li>
                Click &quot;Open OpenSearch Dashboards&quot; to access the dashboard interface
              </li>
              <li>
                Create an index pattern for &quot;ctrf-reports*&quot; to access your test data
              </li>
              <li>Use the Visualize tab to create custom charts and graphs</li>
              <li>Build dashboards by combining multiple visualizations</li>
              <li>Save and share your dashboards with your team</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisualizationPlayground;
