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
          tool_name: 'Smoke Suite',
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

  it('includes pending tests in pass rate denominator', async () => {
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [
        {
          id: 'r1',
          tool_name: 'jest',
          passed: 8,
          failed: 2,
          skipped: 0,
          pending: 10,
          created_at: '2026-01-15T10:00:00Z',
        },
      ],
      total: 1,
    });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);

    // 8 passed out of (8 + 2 + 0 + 10) = 20 total → 40.0%
    // Without pending in denominator this would show 80.0%
    expect(await screen.findByText('40.0%')).toBeInTheDocument();
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

  it('StatCard: renders correct numeric value when data is loaded', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [], total: 42 });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);

    expect(await screen.findByText('42')).toBeInTheDocument();
  });

  it('StatCard: renders loading skeleton while query is in-flight', () => {
    vi.mocked(api.getReports).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.getExecutions).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.getTrends).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.getFlakyTests).mockReturnValue(new Promise(() => {}));

    const { container } = renderWithClient(<DashboardPage />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('passRate: computes 90.0% when 9 tests passed and 1 failed', async () => {
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [{ id: 'r1', name: 'Suite', passed: 9, failed: 1, skipped: 0, created_at: '2026-01-01T00:00:00Z' }],
      total: 1,
    });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);

    expect(await screen.findByText('90.0%')).toBeInTheDocument();
  });

  it('passRate: shows "—" when reports array is empty (NaN guard)', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [], total: 0 });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);

    await screen.findByText('No reports yet.');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('passRate: shows "—" when all test counts are zero (NaN guard)', async () => {
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [{ id: 'r1', name: 'Empty Suite', passed: 0, failed: 0, skipped: 0, created_at: '2026-01-01T00:00:00Z' }],
      total: 1,
    });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);

    await screen.findByText('Empty Suite');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('recent reports table: renders rows with correct passed/failed/skipped values', async () => {
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [{ id: 'r1', name: 'E2E Suite', passed: 47, failed: 13, skipped: 5, created_at: '2026-01-01T00:00:00Z' }],
      total: 1,
    });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });

    renderWithClient(<DashboardPage />);

    await screen.findByText('E2E Suite');
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('flaky tests count card: shows count of flaky tests', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [], total: 0 });
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({
      flaky_tests: [
        { name: 'should render login form', flake_rate: 0.15 },
        { name: 'should submit registration', flake_rate: 0.08 },
        { name: 'should navigate to dashboard', flake_rate: 0.22 },
        { name: 'should load user profile', flake_rate: 0.11 },
        { name: 'should display analytics chart', flake_rate: 0.19 },
      ],
    });

    renderWithClient(<DashboardPage />);

    expect(await screen.findByText('5')).toBeInTheDocument();
  });
});
