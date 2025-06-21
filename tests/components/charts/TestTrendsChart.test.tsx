import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestTrendsChart from '../../../src/components/charts/TestTrendsChart';
import {
  generateMockTestTrendsData,
  generateEmptyTestTrendsData,
  generateSingleDataPoint,
  generateZeroValueData,
  generatePerfectPassRateData,
  generateVariedTestTrendsData,
  mockSuccessfulApiResponse,
  mockApiErrorResponse,
} from '../mockData';

// Mock fetch for tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Recharts components for testing
jest.mock('recharts', () => ({
  LineChart: ({ children, data }: React.PropsWithChildren<{ data: unknown }>) => (
    <div data-testid="line-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Line: ({ dataKey, name, stroke }: { dataKey: string; name: string; stroke: string }) => (
    <div data-testid={`line-${dataKey}`} data-name={name} data-stroke={stroke} />
  ),
  AreaChart: ({ children, data }: React.PropsWithChildren<{ data: unknown }>) => (
    <div data-testid="area-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Area: ({ dataKey, stroke, fill }: { dataKey: string; stroke: string; fill: string }) => (
    <div data-testid={`area-${dataKey}`} data-stroke={stroke} data-fill={fill} />
  ),
  XAxis: ({ dataKey }: { dataKey: string }) => <div data-testid="x-axis" data-datakey={dataKey} />,
  YAxis: ({ yAxisId, label }: { yAxisId?: string; label?: string | { value: string } }) => (
    <div
      data-testid={`y-axis-${yAxisId || 'default'}`}
      data-label={typeof label === 'object' ? label.value : label}
    />
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

describe('TestTrendsChart Component', () => {
  const defaultProps = {
    days: 30,
    token: 'mock-token',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should display loading state when token is provided', () => {
      // Mock fetch to never resolve to test loading state
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<TestTrendsChart {...defaultProps} />);
      expect(screen.getByText('Loading trends from OpenSearch...')).toBeInTheDocument();
      expect(screen.getByText('Analyzing 30 days of data')).toBeInTheDocument();
      expect(screen.getByText('Loading trends from OpenSearch...')).toBeInTheDocument();
    });

    it('should not fetch data when token is not provided', () => {
      render(<TestTrendsChart days={30} />);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Error State', () => {
    it('should display error state when API request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('⚠️ OpenSearch Connection Error')).toBeInTheDocument();
        expect(screen.getByText(/OpenSearch API error: 500/)).toBeInTheDocument();
      });

      // Test retry functionality
      const retryButton = screen.getByText('Retry OpenSearch Query');
      expect(retryButton).toBeInTheDocument();
    });

    it('should display error when API returns unsuccessful response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiErrorResponse('OpenSearch connection timeout')),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('⚠️ OpenSearch Connection Error')).toBeInTheDocument();
        expect(screen.getByText('OpenSearch connection timeout')).toBeInTheDocument();
      });
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('⚠️ OpenSearch Connection Error')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Empty Data State', () => {
    it('should display no data message when data array is empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(generateEmptyTestTrendsData())),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('📊 No Test Data Found')).toBeInTheDocument();
        expect(
          screen.getByText('No test trend data found in OpenSearch for the selected time range.')
        ).toBeInTheDocument();
        expect(
          screen.getByText('Upload test reports to see historical trends.')
        ).toBeInTheDocument();
      });

      // Should show check again button
      expect(screen.getByText('Check Again')).toBeInTheDocument();
    });
  });

  describe('Chart Rendering with Multiple Data Sources', () => {
    it('should render line chart with all data sources when data is available', async () => {
      const mockData = generateVariedTestTrendsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        // Check main chart components are rendered
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
        expect(screen.getByTestId('area-chart')).toBeInTheDocument();
      });

      // Verify all line components for different data sources are rendered
      expect(screen.getByTestId('line-total')).toBeInTheDocument();
      expect(screen.getByTestId('line-passed')).toBeInTheDocument();
      expect(screen.getByTestId('line-failed')).toBeInTheDocument();
      expect(screen.getByTestId('line-skipped')).toBeInTheDocument();
      expect(screen.getByTestId('line-passRate')).toBeInTheDocument();

      // Verify chart has correct data
      const lineChart = screen.getByTestId('line-chart');
      const chartData = JSON.parse(lineChart.getAttribute('data-chart-data') || '[]');
      expect(chartData).toHaveLength(mockData.length);
      expect(chartData[0]).toEqual(mockData[0]);
    });

    it('should display correct line colors and styles for each data source', async () => {
      const mockData = generateVariedTestTrendsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        // Check Total Tests line (blue)
        const totalLine = screen.getByTestId('line-total');
        expect(totalLine).toHaveAttribute('data-stroke', '#3b82f6');
        expect(totalLine).toHaveAttribute('data-name', 'Total Tests');

        // Check Passed line (green)
        const passedLine = screen.getByTestId('line-passed');
        expect(passedLine).toHaveAttribute('data-stroke', '#10b981');
        expect(passedLine).toHaveAttribute('data-name', 'Passed');

        // Check Failed line (red)
        const failedLine = screen.getByTestId('line-failed');
        expect(failedLine).toHaveAttribute('data-stroke', '#ef4444');
        expect(failedLine).toHaveAttribute('data-name', 'Failed');

        // Check Skipped line (orange)
        const skippedLine = screen.getByTestId('line-skipped');
        expect(skippedLine).toHaveAttribute('data-stroke', '#f59e0b');
        expect(skippedLine).toHaveAttribute('data-name', 'Skipped');

        // Check Pass Rate line (purple, dashed)
        const passRateLine = screen.getByTestId('line-passRate');
        expect(passRateLine).toHaveAttribute('data-stroke', '#8b5cf6');
        expect(passRateLine).toHaveAttribute('data-name', 'Pass Rate %');
      });
    });

    it('should render dual Y-axes for test counts and pass rate percentage', async () => {
      const mockData = generateVariedTestTrendsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        // Check left Y-axis for test counts
        const leftYAxis = screen.getByTestId('y-axis-left');
        expect(leftYAxis).toHaveAttribute('data-label', 'Test Count');

        // Check right Y-axis for pass rate percentage
        const rightYAxis = screen.getByTestId('y-axis-right');
        expect(rightYAxis).toHaveAttribute('data-label', 'Pass Rate (%)');
      });
    });

    it('should render legend for all data sources', async () => {
      const mockData = generateVariedTestTrendsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        // Check that legend is rendered
        expect(screen.getByTestId('legend')).toBeInTheDocument();
      });
    });
    it('should render X-axis with date data key', async () => {
      const mockData = generateVariedTestTrendsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        const xAxes = screen.getAllByTestId('x-axis');
        expect(xAxes.length).toBeGreaterThan(0);
        xAxes.forEach(xAxis => {
          expect(xAxis).toHaveAttribute('data-datakey', 'date');
        });
      });
    });
  });

  describe('Single Data Point Handling', () => {
    it('should display single data point notice and render chart correctly', async () => {
      const mockData = generateSingleDataPoint();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);
      await waitFor(() => {
        // Check single data point notice (multiple notices for different charts)
        const singleDataPointNotices = screen.getAllByText('ℹ️ Single Data Point:');
        expect(singleDataPointNotices.length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Only one test result found/)).toHaveLength(2);
        expect(
          screen.getByText(/Add more test reports over time to see trend lines/)
        ).toBeInTheDocument();

        // Charts should still render
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
        expect(screen.getByTestId('area-chart')).toBeInTheDocument();
      });
    });
  });

  describe('Pass Rate Area Chart', () => {
    it('should render pass rate area chart with correct styling', async () => {
      const mockData = generateVariedTestTrendsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        // Check area chart is rendered
        expect(screen.getByTestId('area-chart')).toBeInTheDocument();

        // Check area component for pass rate
        const passRateArea = screen.getByTestId('area-passRate');
        expect(passRateArea).toHaveAttribute('data-stroke', '#10b981');
        expect(passRateArea).toHaveAttribute('data-fill', '#10b981');
      });
    });
  });

  describe('Interactive Features', () => {
    it('should render time range selector with correct options', async () => {
      const mockData = generateVariedTestTrendsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        const timeRangeSelect = screen.getByDisplayValue('Last 30 days');
        expect(timeRangeSelect).toBeInTheDocument();

        // Check all options are present
        expect(screen.getByRole('option', { name: 'Last 7 days' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Last 14 days' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Last 30 days' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Last 90 days' })).toBeInTheDocument();
      });
    });

    it('should update data when time range is changed', async () => {
      const user = userEvent.setup();
      const mockData = generateVariedTestTrendsData();

      // First call for initial load
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      // Second call for time range change
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(generateMockTestTrendsData(7))),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Last 30 days')).toBeInTheDocument();
      });

      // Change time range to 7 days
      const timeRangeSelect = screen.getByDisplayValue('Last 30 days');
      await user.selectOptions(timeRangeSelect, '7');

      // Verify new API call is made with correct parameters
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenLastCalledWith(
          '/api/analytics/test-trends?days=7',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer mock-token',
            }),
          })
        );
      });
    });

    it('should refresh data when refresh button is clicked', async () => {
      const user = userEvent.setup();
      const mockData = generateVariedTestTrendsData();

      // First call for initial load
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      // Second call for refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      // Click refresh button
      const refreshButton = screen.getByText('Refresh');
      await user.click(refreshButton);

      // Verify API is called again
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Summary Statistics', () => {
    it('should display correct summary statistics', async () => {
      const mockData = generateVariedTestTrendsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        // Calculate expected values
        const totalTests = mockData.reduce((sum, d) => sum + d.total, 0);
        const avgPassRate = Math.round(
          mockData.reduce((sum, d) => sum + d.passRate, 0) / mockData.length
        );
        const bestPassRate = Math.max(...mockData.map(d => d.passRate));
        const dataPoints = mockData.length;

        // Check summary statistics
        expect(screen.getByText(totalTests.toString())).toBeInTheDocument();
        expect(screen.getByText(`${avgPassRate}%`)).toBeInTheDocument();
        expect(screen.getByText(`${bestPassRate}%`)).toBeInTheDocument();
        expect(screen.getByText(dataPoints.toString())).toBeInTheDocument();

        // Check labels
        expect(screen.getByText('Total Tests')).toBeInTheDocument();
        expect(screen.getByText('Avg Pass Rate')).toBeInTheDocument();
        expect(screen.getByText('Best Pass Rate')).toBeInTheDocument();
        expect(screen.getByText('Data Points')).toBeInTheDocument();
      });
    });

    it('should handle zero values in summary statistics', async () => {
      const mockData = generateZeroValueData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);
      await waitFor(() => {
        // All statistics should show 0 except data points
        expect(screen.getByText('0')).toBeInTheDocument(); // Total Tests
        const zeroPercentElements = screen.getAllByText('0%');
        expect(zeroPercentElements.length).toBeGreaterThanOrEqual(2); // Avg Pass Rate and Best Pass Rate
        expect(screen.getByText('2')).toBeInTheDocument(); // Data Points
      });
    });
  });

  describe('Data Source Information', () => {
    it('should display OpenSearch data source information', async () => {
      const mockData = generateVariedTestTrendsData();
      const mockResponse = mockSuccessfulApiResponse(mockData);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('📊 Data Source: OpenSearch')).toBeInTheDocument();
        expect(screen.getByText(/Index: ctrf-reports/)).toBeInTheDocument();
        expect(screen.getByText(/Time Range: 30 days/)).toBeInTheDocument();
        expect(screen.getByText(/Documents: 150/)).toBeInTheDocument();
      });
    });
  });

  describe('API Authentication', () => {
    it('should include authorization header when token is provided', async () => {
      const mockData = generateVariedTestTrendsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart token="test-token" days={30} />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/analytics/test-trends?days=30',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            }),
          })
        );
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle perfect pass rate data correctly', async () => {
      const mockData = generatePerfectPassRateData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockData)),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);
      await waitFor(() => {
        // Charts should render normally
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
        expect(screen.getByTestId('area-chart')).toBeInTheDocument();

        // Summary should show 100% pass rates (appears multiple times)
        const hundredPercentElements = screen.getAllByText('100%');
        expect(hundredPercentElements.length).toBeGreaterThanOrEqual(2); // Should appear for both avg and best
      });
    });

    it('should handle malformed API response gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' }),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('⚠️ OpenSearch Connection Error')).toBeInTheDocument();
      });
    });
  });

  describe('Retry Functionality', () => {
    it('should retry API call when retry button is clicked after error', async () => {
      const user = userEvent.setup();

      // First call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error'),
      } as Response);

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(generateVariedTestTrendsData())),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('⚠️ OpenSearch Connection Error')).toBeInTheDocument();
      });

      // Click retry button
      const retryButton = screen.getByText('Retry OpenSearch Query');
      await user.click(retryButton);

      // Should show loading state and then success
      await waitFor(() => {
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry API call when Check Again button is clicked in no data state', async () => {
      const user = userEvent.setup();

      // First call returns empty data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(generateEmptyTestTrendsData())),
      } as Response);

      // Second call returns data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(generateVariedTestTrendsData())),
      } as Response);

      render(<TestTrendsChart {...defaultProps} />);

      // Wait for no data state
      await waitFor(() => {
        expect(screen.getByText('📊 No Test Data Found')).toBeInTheDocument();
      });

      // Click check again button
      const checkAgainButton = screen.getByText('Check Again');
      await user.click(checkAgainButton);

      // Should show data now
      await waitFor(() => {
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
