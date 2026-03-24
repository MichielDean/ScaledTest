import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnalyticsPage } from '../analytics';
import { api } from '../../lib/api';

// ResponsiveContainer needs ResizeObserver which is unavailable in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Cell: () => null,
}));

vi.mock('../../lib/api', () => ({
  api: {
    getTrends: vi.fn(),
    getFlakyTests: vi.fn(),
    getErrorAnalysis: vi.fn(),
    getDurationDistribution: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getTrends).mockResolvedValue({ trends: [] });
    vi.mocked(api.getFlakyTests).mockResolvedValue({ flaky_tests: [] });
    vi.mocked(api.getErrorAnalysis).mockResolvedValue({ errors: [] });
    vi.mocked(api.getDurationDistribution).mockResolvedValue({ distribution: [] });
  });

  it('renders Analytics heading', () => {
    renderWithClient(<AnalyticsPage />);
    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
  });

  it('renders all section headings', () => {
    renderWithClient(<AnalyticsPage />);
    expect(screen.getByRole('heading', { name: 'Pass Rate Trends' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Flaky Tests' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Duration Distribution' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Error Analysis' })).toBeInTheDocument();
  });

  it('shows loading placeholder while trends data is pending', () => {
    vi.mocked(api.getTrends).mockReturnValue(new Promise(() => {}));
    renderWithClient(<AnalyticsPage />);
    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0);
  });

  it('shows empty state for trends when no data available', async () => {
    renderWithClient(<AnalyticsPage />);
    expect(await screen.findByText('No trend data available yet.')).toBeInTheDocument();
  });

  it('shows empty state for flaky tests when none detected', async () => {
    renderWithClient(<AnalyticsPage />);
    expect(await screen.findByText('No flaky tests detected.')).toBeInTheDocument();
  });

  it('shows empty state for duration distribution when no data', async () => {
    renderWithClient(<AnalyticsPage />);
    expect(await screen.findByText('No duration data available.')).toBeInTheDocument();
  });

  it('shows empty state for error analysis when no errors', async () => {
    renderWithClient(<AnalyticsPage />);
    expect(await screen.findByText('No errors recorded.')).toBeInTheDocument();
  });

  it('renders flaky test names and suite when data is available', async () => {
    vi.mocked(api.getFlakyTests).mockResolvedValue({
      flaky_tests: [
        { name: 'login should succeed', flake_rate: 0.3, suite: 'auth' },
        { name: 'checkout flow', flake_rate: 0.15 },
      ],
    });
    renderWithClient(<AnalyticsPage />);
    expect(await screen.findByText('login should succeed')).toBeInTheDocument();
    expect(screen.getByText('checkout flow')).toBeInTheDocument();
    expect(screen.getByText('auth')).toBeInTheDocument();
  });

  it('renders flaky rate percentage for each test', async () => {
    vi.mocked(api.getFlakyTests).mockResolvedValue({
      flaky_tests: [{ name: 'flaky test', flake_rate: 0.42 }],
    });
    renderWithClient(<AnalyticsPage />);
    expect(await screen.findByText('42%')).toBeInTheDocument();
  });

  it('renders error analysis table headers when errors exist', async () => {
    vi.mocked(api.getErrorAnalysis).mockResolvedValue({
      errors: [{ message: 'TypeError: null', count: 3, last_seen: '2026-01-15T10:00:00Z' }],
    });
    renderWithClient(<AnalyticsPage />);
    expect(await screen.findByText('Error Message')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('Last Seen')).toBeInTheDocument();
  });

  it('renders error message and count in error analysis table', async () => {
    vi.mocked(api.getErrorAnalysis).mockResolvedValue({
      errors: [
        { message: 'TypeError: Cannot read property', count: 7, last_seen: '2026-01-15T10:00:00Z' },
      ],
    });
    renderWithClient(<AnalyticsPage />);
    expect(await screen.findByText('TypeError: Cannot read property')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders trend chart when trend data is available', async () => {
    vi.mocked(api.getTrends).mockResolvedValue({
      trends: [
        { date: '2026-01-01', pass_rate: 95 },
        { date: '2026-01-02', pass_rate: 97 },
      ],
    });
    renderWithClient(<AnalyticsPage />);
    expect(await screen.findByTestId('chart-container')).toBeInTheDocument();
  });
});
