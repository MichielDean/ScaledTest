import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestResultsPage } from '../test-results';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    getReports: vi.fn(),
    getReport: vi.fn(),
  },
}));

const mockReport = {
  id: 'rpt-001',
  name: 'My Test Suite',
  tool_name: 'Jest',
  tool_version: '29.0',
  passed: 8,
  failed: 2,
  skipped: 1,
  pending: 0,
  created_at: '2026-01-15T10:00:00Z',
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const detailedReport = {
  ...mockReport,
  tests: [
    { name: 'should render homepage', status: 'passed' as const, duration: 120 },
    { name: 'should handle 404', status: 'failed' as const, duration: 300, message: 'Expected 404' },
  ],
};

describe('TestResultsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getReports).mockResolvedValue({ reports: [], total: 0 });
    vi.mocked(api.getReport).mockResolvedValue({ report: { ...mockReport, tests: [] } });
  });

  it('renders Test Reports heading', () => {
    renderWithClient(<TestResultsPage />);
    expect(screen.getByRole('heading', { name: 'Test Reports' })).toBeInTheDocument();
  });

  it('shows loading state while reports are pending', () => {
    vi.mocked(api.getReports).mockReturnValue(new Promise(() => {}));
    renderWithClient(<TestResultsPage />);
    expect(screen.getByText('Loading reports...')).toBeInTheDocument();
  });

  it('shows empty state when no reports exist', async () => {
    renderWithClient(<TestResultsPage />);
    expect(
      await screen.findByText('No test reports yet. Submit a CTRF report to get started.')
    ).toBeInTheDocument();
  });

  it('shows error message when reports fail to load', async () => {
    vi.mocked(api.getReports).mockRejectedValue(new Error('Server error'));
    renderWithClient(<TestResultsPage />);
    expect(await screen.findByText(/Failed to load.*Server error/)).toBeInTheDocument();
  });

  it('renders report name and pass/fail/skip stats', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [mockReport], total: 1 });
    renderWithClient(<TestResultsPage />);
    expect(await screen.findByText('Jest')).toBeInTheDocument();
    expect(screen.getByText('8 passed')).toBeInTheDocument();
    expect(screen.getByText('2 failed')).toBeInTheDocument();
    expect(screen.getByText('1 skipped')).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderWithClient(<TestResultsPage />);
    expect(
      screen.getByPlaceholderText('Search reports by name, tool, or ID...')
    ).toBeInTheDocument();
  });

  it('renders status filter buttons', () => {
    renderWithClient(<TestResultsPage />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Failed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skipped' })).toBeInTheDocument();
  });

  it('filters reports by name when search term is entered', async () => {
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [
        mockReport,
        { ...mockReport, id: 'rpt-002', tool_name: 'Playwright' },
      ],
      total: 2,
    });
    renderWithClient(<TestResultsPage />);
    await screen.findByText('Jest');

    fireEvent.change(screen.getByPlaceholderText('Search reports by name, tool, or ID...'), {
      target: { value: 'playwright' },
    });

    expect(screen.getByText('Playwright')).toBeInTheDocument();
    expect(screen.queryByText('Jest')).not.toBeInTheDocument();
  });

  it('shows no-match message when search returns no results', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [mockReport], total: 1 });
    renderWithClient(<TestResultsPage />);
    await screen.findByText('Jest');

    fireEvent.change(screen.getByPlaceholderText('Search reports by name, tool, or ID...'), {
      target: { value: 'xyznonexistent' },
    });

    expect(screen.getByText('No reports match your search.')).toBeInTheDocument();
  });

  it('shows loading test results state when report is expanded and detail is pending', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [mockReport], total: 1 });
    vi.mocked(api.getReport).mockReturnValue(new Promise(() => {}));
    renderWithClient(<TestResultsPage />);

    const expandBtn = await screen.findByRole('button', { name: /jest/i });
    fireEvent.click(expandBtn);

    expect(await screen.findByText('Loading test results...')).toBeInTheDocument();
  });

  it('shows no individual results message when report detail has no tests', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [mockReport], total: 1 });
    vi.mocked(api.getReport).mockResolvedValue({ report: { ...mockReport, tests: [] } });
    renderWithClient(<TestResultsPage />);

    const expandBtn = await screen.findByRole('button', { name: /jest/i });
    fireEvent.click(expandBtn);

    expect(
      await screen.findByText('No individual test results available for this report.')
    ).toBeInTheDocument();
  });

  it('renders individual test names when detail is loaded', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [mockReport], total: 1 });
    vi.mocked(api.getReport).mockResolvedValue({ report: detailedReport });
    renderWithClient(<TestResultsPage />);

    const expandBtn = await screen.findByRole('button', { name: /jest/i });
    fireEvent.click(expandBtn);

    expect(await screen.findByText('should render homepage')).toBeInTheDocument();
    expect(screen.getByText('should handle 404')).toBeInTheDocument();
  });

  it('filters test results to only failed tests when Failed button is clicked', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [mockReport], total: 1 });
    vi.mocked(api.getReport).mockResolvedValue({ report: detailedReport });
    renderWithClient(<TestResultsPage />);

    const expandBtn = await screen.findByRole('button', { name: /jest/i });
    fireEvent.click(expandBtn);

    await screen.findByText('should render homepage');

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));

    expect(screen.getByText('should handle 404')).toBeInTheDocument();
    expect(screen.queryByText('should render homepage')).not.toBeInTheDocument();
  });

  it('collapses report when expanded header is clicked again', async () => {
    vi.mocked(api.getReports).mockResolvedValue({ reports: [mockReport], total: 1 });
    vi.mocked(api.getReport).mockResolvedValue({ report: { ...mockReport, tests: [] } });
    renderWithClient(<TestResultsPage />);

    const expandBtn = await screen.findByRole('button', { name: /jest/i });
    fireEvent.click(expandBtn);
    await screen.findByText('No individual test results available for this report.');

    fireEvent.click(expandBtn);
    expect(
      screen.queryByText('No individual test results available for this report.')
    ).not.toBeInTheDocument();
  });
});
