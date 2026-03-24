import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportsComparePage } from '../reports-compare';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    getReports: vi.fn(),
    compareReports: vi.fn(),
  },
}));

const mockReports = [
  {
    id: 'report-001',
    tool_name: 'Jest',
    tool_version: '29.0.0',
    summary: { tests: 100, passed: 95, failed: 5, skipped: 0, pending: 0, other: 0 },
    created_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 'report-002',
    tool_name: 'Playwright',
    tool_version: '1.40.0',
    summary: { tests: 80, passed: 70, failed: 10, skipped: 0, pending: 0, other: 0 },
    created_at: '2026-01-15T10:00:00Z',
  },
];

const cleanDiff = {
  new_failures: [],
  fixed: [],
  duration_regressions: [],
  summary: { base_tests: 100, head_tests: 80, new_failures: 0, fixed: 0, duration_regressions: 0 },
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** Wait for report options to appear in both selects, then return the two comboboxes. */
async function waitForSelects() {
  // Wait for at least one report option to load (option with a real report ID)
  await waitFor(() => {
    const options = screen.getAllByRole('option');
    // Each select has a placeholder "Select..." + the 2 report options = at least 3 total
    expect(options.length).toBeGreaterThan(2);
  });
  return screen.getAllByRole('combobox') as [HTMLSelectElement, HTMLSelectElement];
}

describe('ReportsComparePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getReports).mockResolvedValue({ reports: mockReports, total: 2 });
  });

  it('renders Report Comparison heading', () => {
    renderWithClient(<ReportsComparePage />);
    expect(screen.getByRole('heading', { name: 'Report Comparison' })).toBeInTheDocument();
  });

  it('renders base and head report selector labels', () => {
    renderWithClient(<ReportsComparePage />);
    expect(screen.getByText('Base Report (reference)')).toBeInTheDocument();
    expect(screen.getByText('Head Report (new)')).toBeInTheDocument();
  });

  it('renders two report select dropdowns', () => {
    renderWithClient(<ReportsComparePage />);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('disables compare button when no reports are selected', () => {
    renderWithClient(<ReportsComparePage />);
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled();
  });

  it('shows error when reports list fails to load', async () => {
    vi.mocked(api.getReports).mockRejectedValue(new Error('Network error'));
    renderWithClient(<ReportsComparePage />);
    expect(await screen.findByText('Failed to load reports. Please refresh.')).toBeInTheDocument();
  });

  it('shows validation message when same report is selected for base and head', async () => {
    renderWithClient(<ReportsComparePage />);
    const [baseSelect, headSelect] = await waitForSelects();
    fireEvent.change(baseSelect, { target: { value: 'report-001' } });
    fireEvent.change(headSelect, { target: { value: 'report-001' } });
    expect(screen.getByText('Base and head must be different reports.')).toBeInTheDocument();
  });

  it('disables compare button when same report is selected for both', async () => {
    renderWithClient(<ReportsComparePage />);
    const [baseSelect, headSelect] = await waitForSelects();
    fireEvent.change(baseSelect, { target: { value: 'report-001' } });
    fireEvent.change(headSelect, { target: { value: 'report-001' } });
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled();
  });

  it('enables compare button when different base and head are selected', async () => {
    renderWithClient(<ReportsComparePage />);
    const [baseSelect, headSelect] = await waitForSelects();
    fireEvent.change(baseSelect, { target: { value: 'report-001' } });
    fireEvent.change(headSelect, { target: { value: 'report-002' } });
    expect(screen.getByRole('button', { name: 'Compare' })).not.toBeDisabled();
  });

  it('calls compareReports with base and head IDs on form submit', async () => {
    vi.mocked(api.compareReports).mockResolvedValue({
      base: mockReports[0],
      head: mockReports[1],
      diff: cleanDiff,
    });
    renderWithClient(<ReportsComparePage />);
    const [baseSelect, headSelect] = await waitForSelects();
    fireEvent.change(baseSelect, { target: { value: 'report-001' } });
    fireEvent.change(headSelect, { target: { value: 'report-002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await waitFor(() => {
      expect(vi.mocked(api.compareReports)).toHaveBeenCalledWith('report-001', 'report-002');
    });
  });

  it('shows no regressions message when diff is clean', async () => {
    vi.mocked(api.compareReports).mockResolvedValue({
      base: mockReports[0],
      head: mockReports[1],
      diff: cleanDiff,
    });
    renderWithClient(<ReportsComparePage />);
    const [baseSelect, headSelect] = await waitForSelects();
    fireEvent.change(baseSelect, { target: { value: 'report-001' } });
    fireEvent.change(headSelect, { target: { value: 'report-002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByText('No regressions detected')).toBeInTheDocument();
  });

  it('shows summary stat cards after successful comparison', async () => {
    vi.mocked(api.compareReports).mockResolvedValue({
      base: mockReports[0],
      head: mockReports[1],
      diff: {
        ...cleanDiff,
        summary: { base_tests: 100, head_tests: 80, new_failures: 0, fixed: 3, duration_regressions: 0 },
      },
    });
    renderWithClient(<ReportsComparePage />);
    const [baseSelect, headSelect] = await waitForSelects();
    fireEvent.change(baseSelect, { target: { value: 'report-001' } });
    fireEvent.change(headSelect, { target: { value: 'report-002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByText('Base Tests')).toBeInTheDocument();
    expect(screen.getByText('Head Tests')).toBeInTheDocument();
    expect(screen.getByText('New Failures')).toBeInTheDocument();
    expect(screen.getByText('Fixed')).toBeInTheDocument();
  });

  it('shows New Failures section when diff contains failures', async () => {
    vi.mocked(api.compareReports).mockResolvedValue({
      base: mockReports[0],
      head: mockReports[1],
      diff: {
        new_failures: [{ name: 'login should succeed', head_status: 'failed' }],
        fixed: [],
        duration_regressions: [],
        summary: { base_tests: 100, head_tests: 80, new_failures: 1, fixed: 0, duration_regressions: 0 },
      },
    });
    renderWithClient(<ReportsComparePage />);
    const [baseSelect, headSelect] = await waitForSelects();
    fireEvent.change(baseSelect, { target: { value: 'report-001' } });
    fireEvent.change(headSelect, { target: { value: 'report-002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByRole('heading', { name: 'New Failures' })).toBeInTheDocument();
    expect(screen.getByText('login should succeed')).toBeInTheDocument();
  });

  it('shows Fixed Tests section when diff contains fixed tests', async () => {
    vi.mocked(api.compareReports).mockResolvedValue({
      base: mockReports[0],
      head: mockReports[1],
      diff: {
        new_failures: [],
        fixed: [{ name: 'checkout should complete', base_status: 'failed', head_status: 'passed' }],
        duration_regressions: [],
        summary: { base_tests: 100, head_tests: 80, new_failures: 0, fixed: 1, duration_regressions: 0 },
      },
    });
    renderWithClient(<ReportsComparePage />);
    const [baseSelect, headSelect] = await waitForSelects();
    fireEvent.change(baseSelect, { target: { value: 'report-001' } });
    fireEvent.change(headSelect, { target: { value: 'report-002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByText('Fixed Tests')).toBeInTheDocument();
    expect(screen.getByText('checkout should complete')).toBeInTheDocument();
  });

  it('shows compare error message when API call fails', async () => {
    vi.mocked(api.compareReports).mockRejectedValue(new Error('Comparison failed'));
    renderWithClient(<ReportsComparePage />);
    const [baseSelect, headSelect] = await waitForSelects();
    fireEvent.change(baseSelect, { target: { value: 'report-001' } });
    fireEvent.change(headSelect, { target: { value: 'report-002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByText('Comparison failed')).toBeInTheDocument();
  });

  it('shows Export diff as JSON button after successful comparison', async () => {
    vi.mocked(api.compareReports).mockResolvedValue({
      base: mockReports[0],
      head: mockReports[1],
      diff: cleanDiff,
    });
    renderWithClient(<ReportsComparePage />);
    const [baseSelect, headSelect] = await waitForSelects();
    fireEvent.change(baseSelect, { target: { value: 'report-001' } });
    fireEvent.change(headSelect, { target: { value: 'report-002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByText('Export diff as JSON')).toBeInTheDocument();
  });
});
