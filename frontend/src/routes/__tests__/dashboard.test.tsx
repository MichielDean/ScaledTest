import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from '../dashboard';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    getReports: vi.fn(),
    getExecutions: vi.fn(),
    getTrends: vi.fn(),
    getFlakyTests: vi.fn(),
  },
}));

// Mock recharts — jsdom cannot render SVG
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard heading', () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [], total: 0 });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows stat card titles', () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [], total: 0 });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);
    expect(screen.getByText('Total Reports')).toBeInTheDocument();
    expect(screen.getByText('Total Executions')).toBeInTheDocument();
    expect(screen.getByText('Pass Rate')).toBeInTheDocument();
    expect(screen.getByText('Flaky Tests')).toBeInTheDocument();
  });

  it('shows empty state messages when no data', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [], total: 0 });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);

    expect(await screen.findByText('No reports yet.')).toBeInTheDocument();
    expect(await screen.findByText('No executions yet.')).toBeInTheDocument();
    expect(await screen.findByText('No trend data available yet.')).toBeInTheDocument();
  });

  it('renders report data when available', async () => {
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [
        {
          id: 'r1',
          name: 'Smoke Suite',
          passed: 8,
          failed: 2,
          skipped: 1,
          created_at: '2026-01-15T10:00:00Z',
        },
      ],
      total: 1,
    });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);

    expect(await screen.findByText('Smoke Suite')).toBeInTheDocument();
  });

  it('renders execution data with status badges', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [], total: 0 });
    vi.mocked(api.getExecutions).mockResolvedValue({
      executions: [
        { id: 'e1', command: 'npm test', status: 'completed', created_at: '2026-01-15T10:00:00Z' },
        { id: 'e2', command: 'yarn e2e', status: 'failed', created_at: '2026-01-15T11:00:00Z' },
      ],
      total: 2,
    });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);

    expect(await screen.findByText('npm test')).toBeInTheDocument();
    expect(await screen.findByText('yarn e2e')).toBeInTheDocument();
    expect(await screen.findByText('completed')).toBeInTheDocument();
    expect(await screen.findByText('failed')).toBeInTheDocument();
  });

  it('renders trend chart when data is available', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [], total: 0 });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({
      trends: [
        { date: '2026-01-01', pass_rate: 95.0 },
        { date: '2026-01-02', pass_rate: 92.5 },
      ],
    });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);

    expect(await screen.findByTestId('line-chart')).toBeInTheDocument();
  });
});
