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

  it('renders pass rate as "—" without percent sign when all test counts are zero', async () => {
    const zeroReport = { ...mockReport, passed: 0, failed: 0, skipped: 0, pending: 0 };
    vi.mocked(api.getReports).mockResolvedValue({ reports: [zeroReport], total: 1 });
    renderWithClient(<TestResultsPage />);
    await screen.findByText('Jest');
    expect(screen.queryByText('—%')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
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

    expect(screen.getByText('No reports match your search or filter.')).toBeInTheDocument();
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

  it('auto-expands report matching ?report=<id> query param on mount', async () => {
    window.history.pushState({}, '', '?report=rpt-001');
    vi.mocked(api.getReports).mockResolvedValue({ reports: [mockReport], total: 1 });
    vi.mocked(api.getReport).mockResolvedValue({ report: { ...mockReport, tests: [] } });

    renderWithClient(<TestResultsPage />);

    const expandBtn = await screen.findByRole('button', { name: /jest/i });
    expect(expandBtn).toHaveAttribute('aria-expanded', 'true');

    window.history.pushState({}, '', '/');
  });
});

describe('TestResultsPage — report-level status filtering', () => {
  const passedOnlyReport = {
    ...mockReport,
    id: 'rpt-pass',
    tool_name: 'PassSuite',
    passed: 5,
    failed: 0,
    skipped: 0,
  };
  const failedReport = {
    ...mockReport,
    id: 'rpt-fail',
    tool_name: 'FailSuite',
    passed: 3,
    failed: 2,
    skipped: 0,
  };
  const skippedReport = {
    ...mockReport,
    id: 'rpt-skip',
    tool_name: 'SkipSuite',
    passed: 4,
    failed: 0,
    skipped: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getReport).mockResolvedValue({ report: { ...mockReport, tests: [] } });
  });

  it('shows only reports with failures when Failed filter is selected', async () => {
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [passedOnlyReport, failedReport],
      total: 2,
    });
    renderWithClient(<TestResultsPage />);
    await screen.findByText('PassSuite');

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));

    expect(screen.getByText('FailSuite')).toBeInTheDocument();
    expect(screen.queryByText('PassSuite')).not.toBeInTheDocument();
  });

  it('shows only all-passing reports when Passed filter is selected', async () => {
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [passedOnlyReport, failedReport],
      total: 2,
    });
    renderWithClient(<TestResultsPage />);
    await screen.findByText('PassSuite');

    fireEvent.click(screen.getByRole('button', { name: 'Passed' }));

    expect(screen.getByText('PassSuite')).toBeInTheDocument();
    expect(screen.queryByText('FailSuite')).not.toBeInTheDocument();
  });

  it('shows only reports with skipped tests when Skipped filter is selected', async () => {
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [passedOnlyReport, skippedReport],
      total: 2,
    });
    renderWithClient(<TestResultsPage />);
    await screen.findByText('PassSuite');

    fireEvent.click(screen.getByRole('button', { name: 'Skipped' }));

    expect(screen.getByText('SkipSuite')).toBeInTheDocument();
    expect(screen.queryByText('PassSuite')).not.toBeInTheDocument();
  });

  it('shows all reports when All filter is selected after a status filter', async () => {
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [passedOnlyReport, failedReport],
      total: 2,
    });
    renderWithClient(<TestResultsPage />);
    await screen.findByText('PassSuite');

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));
    expect(screen.queryByText('PassSuite')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(screen.getByText('PassSuite')).toBeInTheDocument();
    expect(screen.getByText('FailSuite')).toBeInTheDocument();
  });

  it('shows no-match message when status filter produces no matching reports', async () => {
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [passedOnlyReport],
      total: 1,
    });
    renderWithClient(<TestResultsPage />);
    await screen.findByText('PassSuite');

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));

    expect(screen.getByText('No reports match your search or filter.')).toBeInTheDocument();
  });

  it('applies status filter and search term together, showing only reports matching both', async () => {
    const anotherFailedReport = {
      ...mockReport,
      id: 'rpt-fail2',
      tool_name: 'CypressSuite',
      passed: 1,
      failed: 3,
      skipped: 0,
    };
    vi.mocked(api.getReports).mockResolvedValue({
      reports: [passedOnlyReport, failedReport, anotherFailedReport],
      total: 3,
    });
    renderWithClient(<TestResultsPage />);
    await screen.findByText('PassSuite');

    // Apply 'Failed' status filter — PassSuite should disappear
    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));
    expect(screen.queryByText('PassSuite')).not.toBeInTheDocument();
    expect(screen.getByText('FailSuite')).toBeInTheDocument();
    expect(screen.getByText('CypressSuite')).toBeInTheDocument();

    // Also apply search term — only CypressSuite matches 'cypress' among the failed reports
    fireEvent.change(screen.getByPlaceholderText('Search reports by name, tool, or ID...'), {
      target: { value: 'cypress' },
    });

    expect(screen.getByText('CypressSuite')).toBeInTheDocument();
    expect(screen.queryByText('FailSuite')).not.toBeInTheDocument();
    expect(screen.queryByText('PassSuite')).not.toBeInTheDocument();
  });
});
