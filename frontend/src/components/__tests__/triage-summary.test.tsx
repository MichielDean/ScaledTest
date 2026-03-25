import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TriageSummary } from '../triage-summary';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    getTriage: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const mockTriageComplete = {
  triage_status: 'complete',
  summary:
    'Two clusters of failures were identified: database timeouts and assertion mismatches.',
  clusters: [
    {
      id: 'cluster-1',
      root_cause: 'Database connection timeout',
      label: 'DB Timeout',
      failures: [
        { test_result_id: 'tr-1', classification: 'new' },
        { test_result_id: 'tr-2', classification: 'regression' },
      ],
    },
    {
      id: 'cluster-2',
      root_cause: 'Assertion mismatch in user service',
      failures: [{ test_result_id: 'tr-3', classification: 'flaky' }],
    },
  ],
  metadata: {
    generated_at: '2026-01-15T10:00:00Z',
    model: 'gpt-4',
  },
};

const mockTriagePending = { triage_status: 'pending' };

const mockTriageFailed = {
  triage_status: 'failed',
  error: 'LLM provider returned an error',
  metadata: { generated_at: '2026-01-15T10:00:00Z' },
};

describe('TriageSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when report has no failures', () => {
    const { container } = renderWithClient(
      <TriageSummary reportId="rpt-001" hasFailed={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows loading skeleton while triage data is fetching', () => {
    vi.mocked(api.getTriage).mockReturnValue(new Promise(() => {}));
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    expect(screen.getByTestId('triage-skeleton')).toBeInTheDocument();
  });

  it('shows loading skeleton when triage_status is pending', async () => {
    vi.mocked(api.getTriage).mockResolvedValue(mockTriagePending);
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    expect(await screen.findByTestId('triage-skeleton')).toBeInTheDocument();
  });

  it('shows the Triage Summary heading when complete', async () => {
    vi.mocked(api.getTriage).mockResolvedValue(mockTriageComplete);
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    expect(await screen.findByText('Triage Summary')).toBeInTheDocument();
  });

  it('displays the overall summary paragraph when complete', async () => {
    vi.mocked(api.getTriage).mockResolvedValue(mockTriageComplete);
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    expect(await screen.findByText(mockTriageComplete.summary)).toBeInTheDocument();
  });

  it('renders cluster root cause labels', async () => {
    vi.mocked(api.getTriage).mockResolvedValue(mockTriageComplete);
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    expect(await screen.findByText('Database connection timeout')).toBeInTheDocument();
    expect(screen.getByText('Assertion mismatch in user service')).toBeInTheDocument();
  });

  it('shows classification badges when cluster is expanded', async () => {
    vi.mocked(api.getTriage).mockResolvedValue(mockTriageComplete);
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    await screen.findByText('Database connection timeout');

    fireEvent.click(screen.getByRole('button', { name: /database connection timeout/i }));

    expect(screen.getByText('new')).toBeInTheDocument();
    expect(screen.getByText('regression')).toBeInTheDocument();
  });

  it('shows flaky badge when cluster with flaky failure is expanded', async () => {
    vi.mocked(api.getTriage).mockResolvedValue(mockTriageComplete);
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    await screen.findByText('Assertion mismatch in user service');

    fireEvent.click(
      screen.getByRole('button', { name: /assertion mismatch in user service/i }),
    );

    expect(screen.getByText('flaky')).toBeInTheDocument();
  });

  it('hides failure list when expanded cluster is clicked again', async () => {
    vi.mocked(api.getTriage).mockResolvedValue(mockTriageComplete);
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    await screen.findByText('Database connection timeout');

    fireEvent.click(screen.getByRole('button', { name: /database connection timeout/i }));
    expect(screen.getByText('new')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /database connection timeout/i }));
    expect(screen.queryByText('new')).not.toBeInTheDocument();
  });

  it('shows graceful fallback when triage status is failed', async () => {
    vi.mocked(api.getTriage).mockResolvedValue(mockTriageFailed);
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    expect(await screen.findByText(/triage analysis unavailable/i)).toBeInTheDocument();
  });

  it('shows fallback when triage record is not found', async () => {
    vi.mocked(api.getTriage).mockRejectedValue(new Error('triage not found'));
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    expect(
      await screen.findByText(/triage analysis not yet available/i),
    ).toBeInTheDocument();
  });

  it('shows error state for unexpected fetch errors', async () => {
    vi.mocked(api.getTriage).mockRejectedValue(new Error('Network error'));
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    expect(await screen.findByText(/failed to load triage/i)).toBeInTheDocument();
  });

  it('shows unclustered failures section when unclustered failures are present', async () => {
    const triageWithUnclustered = {
      ...mockTriageComplete,
      unclustered_failures: [{ test_result_id: 'tr-99', classification: 'unknown' }],
    };
    vi.mocked(api.getTriage).mockResolvedValue(triageWithUnclustered);
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    expect(await screen.findByText(/unclustered/i)).toBeInTheDocument();
  });

  it('shows unclustered failure badges when unclustered section is expanded', async () => {
    const triageWithUnclustered = {
      ...mockTriageComplete,
      unclustered_failures: [{ test_result_id: 'tr-99', classification: 'unknown' }],
    };
    vi.mocked(api.getTriage).mockResolvedValue(triageWithUnclustered);
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    await screen.findByText(/unclustered/i);

    fireEvent.click(screen.getByRole('button', { name: /unclustered/i }));

    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('does not show unclustered section when there are no unclustered failures', async () => {
    vi.mocked(api.getTriage).mockResolvedValue(mockTriageComplete);
    renderWithClient(<TriageSummary reportId="rpt-001" hasFailed={true} />);
    await screen.findByText('Triage Summary');
    expect(screen.queryByText(/unclustered/i)).not.toBeInTheDocument();
  });
});
