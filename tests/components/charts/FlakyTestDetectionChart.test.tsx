import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FlakyTestDetectionChart from '../../../src/components/charts/FlakyTestDetectionChart';
import { mockSuccessfulApiResponse } from '../mockData';

// Mock Recharts components for testing
jest.mock('recharts', () => ({
  BarChart: ({ children, data }: React.PropsWithChildren<{ data: unknown }>) => (
    <div data-testid="bar-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ dataKey, name }: { dataKey: string; name: string }) => (
    <div data-testid={`bar-${dataKey}`} data-name={name} />
  ),
  ScatterChart: ({ children, data }: React.PropsWithChildren<{ data: unknown }>) => (
    <div data-testid="scatter-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Scatter: ({ name, fill }: { name: string; fill: string }) => (
    <div data-testid="scatter" data-name={name} data-fill={fill} />
  ),
  XAxis: ({ dataKey, type }: { dataKey: string; type?: string }) => (
    <div data-testid="x-axis" data-datakey={dataKey} data-type={type} />
  ),
  YAxis: ({ dataKey, type, domain }: { dataKey?: string; type?: string; domain?: unknown }) => (
    <div
      data-testid="y-axis"
      data-datakey={dataKey}
      data-type={type}
      data-domain={JSON.stringify(domain)}
    />
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Cell: () => <div data-testid="cell" />,
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

// Mock fetch globally
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('FlakyTestDetectionChart Component', () => {
  const defaultProps = {
    token: 'mock-token',
  };

  const mockFlakyTestsData = [
    {
      testName: 'should login successfully',
      suite: 'Auth Tests',
      totalRuns: 100,
      passed: 85,
      failed: 15,
      skipped: 0,
      flakyScore: 15.0,
      avgDuration: 1200,
      isMarkedFlaky: false,
      isFlaky: true,
    },
    {
      testName: 'should load dashboard',
      suite: 'UI Tests',
      totalRuns: 50,
      passed: 45,
      failed: 5,
      skipped: 0,
      flakyScore: 10.0,
      avgDuration: 800,
      isMarkedFlaky: true,
      isFlaky: true,
    },
    {
      testName: 'should validate input',
      suite: 'Form Tests',
      totalRuns: 30,
      passed: 22,
      failed: 8,
      skipped: 0,
      flakyScore: 26.7,
      avgDuration: 500,
      isMarkedFlaky: false,
      isFlaky: false,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should display loading state when token is provided', () => {
      // Mock fetch to never resolve to test loading state
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<FlakyTestDetectionChart {...defaultProps} />);
      expect(
        screen.getByText('Loading flaky test analysis from OpenSearch...')
      ).toBeInTheDocument();
      expect(screen.getByText('Analyzing test patterns across all reports')).toBeInTheDocument();
    });

    it('should not fetch data when no token is provided', () => {
      render(<FlakyTestDetectionChart />);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Error State', () => {
    it('should display error message when API call fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      } as Response);

      render(<FlakyTestDetectionChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('⚠️ OpenSearch Connection Error')).toBeInTheDocument();
        expect(screen.getByText(/OpenSearch API error: 500/)).toBeInTheDocument();
      });
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<FlakyTestDetectionChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('⚠️ OpenSearch Connection Error')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('No Data State', () => {
    it('should display no flaky tests message when no data is found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse([])),
      } as Response);

      render(<FlakyTestDetectionChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('🎉 No Flaky Tests Detected!')).toBeInTheDocument();
        expect(
          screen.getByText('All tests appear to be stable across multiple runs.')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Chart Rendering with Data', () => {
    it('should render bar chart and scatter chart when flaky tests are found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockFlakyTestsData)),
      } as Response);

      render(<FlakyTestDetectionChart {...defaultProps} />);

      await waitFor(() => {
        // Check main chart components are rendered
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
        expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
      });

      // Verify chart data contains flaky tests
      const barChart = screen.getByTestId('bar-chart');
      const barChartData = JSON.parse(barChart.getAttribute('data-chart-data') || '[]');
      expect(barChartData.length).toBeGreaterThan(0);
      expect(barChartData.some((test: { isFlaky: boolean }) => test.isFlaky)).toBe(true);
    });

    it('should display correct summary statistics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockFlakyTestsData)),
      } as Response);

      render(<FlakyTestDetectionChart {...defaultProps} />);

      await waitFor(() => {
        // Check summary statistics
        expect(screen.getByText('2')).toBeInTheDocument(); // Truly Flaky Tests
        expect(screen.getByText('0')).toBeInTheDocument(); // High Failure Rate (>50%)
        expect(screen.getByText('180')).toBeInTheDocument(); // Total Test Runs
      });
    });
  });

  describe('Interactive Features', () => {
    it('should refresh data when refresh button is clicked', async () => {
      const user = userEvent.setup();

      // First call for initial load
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockFlakyTestsData)),
      } as Response);

      // Second call for refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockFlakyTestsData)),
      } as Response);

      render(<FlakyTestDetectionChart {...defaultProps} />);

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

    it('should retry API call when retry button is clicked in error state', async () => {
      const user = userEvent.setup();

      // First call returns error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error'),
      } as Response);

      // Second call returns data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockFlakyTestsData)),
      } as Response);

      render(<FlakyTestDetectionChart {...defaultProps} />);

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('⚠️ OpenSearch Connection Error')).toBeInTheDocument();
      });

      // Click retry button
      const retryButton = screen.getByText('Retry OpenSearch Query');
      await user.click(retryButton);

      // Should show success state
      await waitFor(() => {
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Data Source Information', () => {
    it('should display OpenSearch data source information', async () => {
      const mockResponse = mockSuccessfulApiResponse(mockFlakyTestsData);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      render(<FlakyTestDetectionChart {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('🔍 Data Source: OpenSearch')).toBeInTheDocument();
        expect(screen.getByText(/Index: ctrf-reports/)).toBeInTheDocument();
        expect(screen.getByText(/Flaky Tests Found:/)).toBeInTheDocument();
      });
    });
  });

  describe('API Authentication', () => {
    it('should include authorization header when token is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessfulApiResponse(mockFlakyTestsData)),
      } as Response);

      render(<FlakyTestDetectionChart token="test-token" />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/analytics/flaky-tests',
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
});
