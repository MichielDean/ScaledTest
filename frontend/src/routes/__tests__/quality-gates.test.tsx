import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QualityGatesPage } from '../quality-gates';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    getQualityGates: vi.fn(),
    createQualityGate: vi.fn(),
    updateQualityGate: vi.fn(),
    deleteQualityGate: vi.fn(),
    evaluateQualityGate: vi.fn(),
    getQualityGateEvaluations: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('QualityGatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading and new gate button', () => {
    vi.mocked(api.getQualityGates).mockResolvedValue({ quality_gates: [], total: 0 });

    renderWithClient(<QualityGatesPage />);

    expect(screen.getByRole('heading', { name: 'Quality Gates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Quality Gate' })).toBeInTheDocument();
  });

  it('shows empty state when no gates exist', async () => {
    vi.mocked(api.getQualityGates).mockResolvedValue({ quality_gates: [], total: 0 });

    renderWithClient(<QualityGatesPage />);

    expect(await screen.findByText('No quality gates yet')).toBeInTheDocument();
  });

  it('renders gate cards when gates exist', async () => {
    vi.mocked(api.getQualityGates).mockResolvedValue({
      quality_gates: [
        {
          id: 'g1',
          team_id: 't1',
          name: 'Release Gate',
          description: 'Must pass before release',
          rules: [{ type: 'pass_rate', params: { threshold: 95 } }],
          active: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      total: 1,
    });

    renderWithClient(<QualityGatesPage />);

    expect(await screen.findByText('Release Gate')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Evaluate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('opens create form when New Quality Gate is clicked', async () => {
    vi.mocked(api.getQualityGates).mockResolvedValue({ quality_gates: [], total: 0 });

    renderWithClient(<QualityGatesPage />);

    await screen.findByText('No quality gates yet');
    fireEvent.click(screen.getByRole('button', { name: 'New Quality Gate' }));

    expect(screen.getByRole('heading', { name: 'Create Quality Gate' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Quality Gate' })).toBeInTheDocument();
  });

  it('validates name is required on form submit', async () => {
    vi.mocked(api.getQualityGates).mockResolvedValue({ quality_gates: [], total: 0 });

    renderWithClient(<QualityGatesPage />);

    await screen.findByText('No quality gates yet');
    fireEvent.click(screen.getByRole('button', { name: 'New Quality Gate' }));

    // Submit without filling name
    fireEvent.click(screen.getByRole('button', { name: 'Create Quality Gate' }));

    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
  });

  it('calls createQualityGate on form submit', async () => {
    vi.mocked(api.getQualityGates).mockResolvedValue({ quality_gates: [], total: 0 });
    vi.mocked(api.createQualityGate).mockResolvedValue({ id: 'new-gate' });

    renderWithClient(<QualityGatesPage />);

    await screen.findByText('No quality gates yet');
    fireEvent.click(screen.getByRole('button', { name: 'New Quality Gate' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI Gate' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'CI pipeline gate' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Quality Gate' }));

    await waitFor(() => {
      expect(api.createQualityGate).toHaveBeenCalledTimes(1);
    });
  });

  it('calls evaluateQualityGate when Evaluate button is clicked', async () => {
    vi.mocked(api.getQualityGates).mockResolvedValue({
      quality_gates: [
        {
          id: 'g1',
          team_id: 't1',
          name: 'Test Gate',
          description: '',
          rules: [{ type: 'pass_rate', params: { threshold: 90 } }],
          active: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      total: 1,
    });
    vi.mocked(api.evaluateQualityGate).mockResolvedValue({
      id: 'eval-1',
      gate_id: 'g1',
      report_id: 'r1',
      passed: true,
      details: { passed: true, results: [] },
      created_at: '2026-01-01T00:00:00Z',
    });

    renderWithClient(<QualityGatesPage />);

    const evalBtn = await screen.findByRole('button', { name: 'Evaluate' });
    fireEvent.click(evalBtn);

    await waitFor(() => {
      expect(api.evaluateQualityGate).toHaveBeenCalledWith('g1');
    });
  });

  it('shows evaluation result badge after evaluation', async () => {
    vi.mocked(api.getQualityGates).mockResolvedValue({
      quality_gates: [
        {
          id: 'g1',
          team_id: 't1',
          name: 'Strict Gate',
          rules: [{ type: 'pass_rate', params: { threshold: 100 } }],
          active: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      total: 1,
    });
    vi.mocked(api.evaluateQualityGate).mockResolvedValue({
      id: 'eval-1',
      gate_id: 'g1',
      report_id: 'r1',
      passed: false,
      details: {
        passed: false,
        results: [
          { type: 'pass_rate', passed: false, threshold: 100, actual: 80, message: '80% < 100%' },
        ],
      },
      created_at: '2026-01-01T00:00:00Z',
    });

    renderWithClient(<QualityGatesPage />);

    const evalBtn = await screen.findByRole('button', { name: 'Evaluate' });
    fireEvent.click(evalBtn);

    expect(await screen.findByText('Failed')).toBeInTheDocument();
  });
});
