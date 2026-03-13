import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExecutionsPage } from '../executions';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    getExecutions: vi.fn(),
    getExecution: vi.fn(),
  },
}));

vi.mock('../../hooks/use-websocket', () => ({
  useWebSocket: () => ({ lastMessage: null, isConnected: false }),
}));

vi.mock('../../stores/execution-store', () => ({
  useExecutionStore: () => ({
    progress: null,
    workers: new Map(),
    testResults: [],
    reset: vi.fn(),
    setProgress: vi.fn(),
    addTestResult: vi.fn(),
    updateWorker: vi.fn(),
    setExecutionStatus: vi.fn(),
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ExecutionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading', () => {
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });

    renderWithClient(<ExecutionsPage />);

    expect(screen.getByRole('heading', { name: 'Executions' })).toBeInTheDocument();
  });

  it('shows empty state when no executions exist', async () => {
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });

    renderWithClient(<ExecutionsPage />);

    expect(await screen.findByText('No executions yet.')).toBeInTheDocument();
  });

  it('shows select prompt when no execution is selected', async () => {
    vi.mocked(api.getExecutions).mockResolvedValue({ executions: [], total: 0 });

    renderWithClient(<ExecutionsPage />);

    expect(
      await screen.findByText('Select an execution to view real-time progress')
    ).toBeInTheDocument();
  });

  it('renders execution list with status badges', async () => {
    vi.mocked(api.getExecutions).mockResolvedValue({
      executions: [
        { id: 'e1', command: 'npm test', status: 'completed', created_at: '2026-01-15T10:00:00Z' },
        { id: 'e2', command: 'yarn e2e', status: 'running', created_at: '2026-01-15T11:00:00Z' },
        { id: 'e3', command: 'pytest -v', status: 'failed', created_at: '2026-01-15T12:00:00Z' },
      ],
      total: 3,
    });

    renderWithClient(<ExecutionsPage />);

    expect(await screen.findByText('npm test')).toBeInTheDocument();
    expect(screen.getByText('yarn e2e')).toBeInTheDocument();
    expect(screen.getByText('pytest -v')).toBeInTheDocument();

    // Status badges
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('renders execution list items as clickable buttons', async () => {
    vi.mocked(api.getExecutions).mockResolvedValue({
      executions: [
        { id: 'e1', command: 'npm test', status: 'pending', created_at: '2026-01-15T10:00:00Z' },
      ],
      total: 1,
    });

    renderWithClient(<ExecutionsPage />);

    const button = await screen.findByText('npm test');
    expect(button.closest('button')).toBeInTheDocument();
  });

  it('renders cancelled status badge', async () => {
    vi.mocked(api.getExecutions).mockResolvedValue({
      executions: [
        {
          id: 'e1',
          command: 'go test ./...',
          status: 'cancelled',
          created_at: '2026-01-15T10:00:00Z',
        },
      ],
      total: 1,
    });

    renderWithClient(<ExecutionsPage />);

    expect(await screen.findByText('cancelled')).toBeInTheDocument();
    expect(screen.getByText('go test ./...')).toBeInTheDocument();
  });
});
