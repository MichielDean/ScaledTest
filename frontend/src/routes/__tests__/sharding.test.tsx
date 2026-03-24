import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShardingPage } from '../sharding';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    getShardDurations: vi.fn(),
    createShardPlan: vi.fn(),
  },
}));

const mockDuration = {
  id: 'd1',
  test_name: 'should login successfully',
  suite: 'auth',
  avg_duration_ms: 250,
  p95_duration_ms: 400,
  min_duration_ms: 100,
  max_duration_ms: 500,
  run_count: 10,
  last_status: 'passed',
  updated_at: '2026-01-15T10:00:00Z',
};

const mockPlan = {
  execution_id: 'exec-1',
  total_workers: 2,
  strategy: 'duration_balanced',
  shards: [
    { worker_id: '1', test_names: ['test-login'], est_duration_ms: 250, test_count: 1 },
    { worker_id: '2', test_names: ['test-checkout'], est_duration_ms: 300, test_count: 1 },
  ],
  est_total_ms: 550,
  est_wall_clock_ms: 300,
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ShardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getShardDurations).mockResolvedValue({ durations: [] });
  });

  it('renders Test Sharding heading', () => {
    renderWithClient(<ShardingPage />);
    expect(screen.getByRole('heading', { name: 'Test Sharding' })).toBeInTheDocument();
  });

  it('renders Test Duration History section heading', () => {
    renderWithClient(<ShardingPage />);
    expect(screen.getByRole('heading', { name: 'Test Duration History' })).toBeInTheDocument();
  });

  it('shows empty state when no duration data exists', async () => {
    renderWithClient(<ShardingPage />);
    expect(await screen.findByText('No duration data yet')).toBeInTheDocument();
  });

  it('shows loading skeleton while data is pending', () => {
    vi.mocked(api.getShardDurations).mockReturnValue(new Promise(() => {}));
    renderWithClient(<ShardingPage />);
    expect(screen.queryByText('No duration data yet')).not.toBeInTheDocument();
    expect(screen.queryByText('should login successfully')).not.toBeInTheDocument();
  });

  it('shows error message when durations query fails', async () => {
    vi.mocked(api.getShardDurations).mockRejectedValue(new Error('Connection refused'));
    renderWithClient(<ShardingPage />);
    expect(await screen.findByText(/Failed to load durations.*Connection refused/)).toBeInTheDocument();
  });

  it('renders duration history table with test name and stats', async () => {
    vi.mocked(api.getShardDurations).mockResolvedValue({ durations: [mockDuration] });
    renderWithClient(<ShardingPage />);
    expect(await screen.findByText('should login successfully')).toBeInTheDocument();
    expect(screen.getByText('auth')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders table headers for duration history', async () => {
    vi.mocked(api.getShardDurations).mockResolvedValue({ durations: [mockDuration] });
    renderWithClient(<ShardingPage />);
    expect(await screen.findByText('Test Name')).toBeInTheDocument();
    expect(screen.getByText('Suite')).toBeInTheDocument();
    expect(screen.getByText('Avg (ms)')).toBeInTheDocument();
    expect(screen.getByText('P95 (ms)')).toBeInTheDocument();
    expect(screen.getByText('Runs')).toBeInTheDocument();
  });

  it('shows Create Shard Plan button', () => {
    renderWithClient(<ShardingPage />);
    expect(screen.getByRole('button', { name: 'Create Shard Plan' })).toBeInTheDocument();
  });

  it('shows shard plan form when Create Shard Plan is clicked', () => {
    renderWithClient(<ShardingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Shard Plan' }));
    expect(screen.getByRole('heading', { name: 'Create Shard Plan' })).toBeInTheDocument();
  });

  it('toggle button changes label to Cancel when form is open', () => {
    renderWithClient(<ShardingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Shard Plan' }));
    // The top toggle button now reads 'Cancel'
    expect(screen.getAllByRole('button', { name: 'Cancel' }).length).toBeGreaterThan(0);
  });

  it('hides shard plan form when Cancel toggle button is clicked', () => {
    renderWithClient(<ShardingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Shard Plan' }));
    // Click the first Cancel button (the toggle, which comes first in DOM)
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(screen.queryByRole('heading', { name: 'Create Shard Plan' })).not.toBeInTheDocument();
  });

  it('shows form validation error when no test names and no duration history', async () => {
    renderWithClient(<ShardingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Shard Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));
    expect(await screen.findByText(/At least one test name is required/)).toBeInTheDocument();
  });

  it('renders strategy select with available options', () => {
    renderWithClient(<ShardingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Shard Plan' }));
    const strategySelect = screen.getByLabelText(/strategy/i);
    expect(strategySelect).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Duration Balanced' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Round Robin' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Suite Grouped' })).toBeInTheDocument();
  });

  it('calls createShardPlan with custom test names from textarea', async () => {
    vi.mocked(api.createShardPlan).mockResolvedValue(mockPlan);
    renderWithClient(<ShardingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Shard Plan' }));

    const textarea = screen.getByLabelText(/test names/i);
    fireEvent.change(textarea, { target: { value: 'test-login\ntest-checkout' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));

    await waitFor(() => {
      expect(vi.mocked(api.createShardPlan)).toHaveBeenCalledWith({
        test_names: ['test-login', 'test-checkout'],
        num_workers: 2,
        strategy: 'duration_balanced',
      });
    });
  });

  it('calls createShardPlan using duration history test names when textarea is empty', async () => {
    vi.mocked(api.getShardDurations).mockResolvedValue({ durations: [mockDuration] });
    vi.mocked(api.createShardPlan).mockResolvedValue(mockPlan);
    renderWithClient(<ShardingPage />);
    await screen.findByText('should login successfully');

    fireEvent.click(screen.getByRole('button', { name: 'Create Shard Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));

    await waitFor(() => {
      expect(vi.mocked(api.createShardPlan)).toHaveBeenCalledWith(
        expect.objectContaining({ test_names: ['should login successfully'] })
      );
    });
  });

  it('shows shard plan result view after successful creation', async () => {
    vi.mocked(api.createShardPlan).mockResolvedValue(mockPlan);
    renderWithClient(<ShardingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Shard Plan' }));

    const textarea = screen.getByLabelText(/test names/i);
    fireEvent.change(textarea, { target: { value: 'test-login\ntest-checkout' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));

    expect(await screen.findByText('Shard Plan')).toBeInTheDocument();
    expect(screen.getByText(/Worker 1/)).toBeInTheDocument();
  });

  it('shows mutation error when createShardPlan fails', async () => {
    vi.mocked(api.createShardPlan).mockRejectedValue(new Error('Plan creation failed'));
    renderWithClient(<ShardingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Shard Plan' }));

    const textarea = screen.getByLabelText(/test names/i);
    fireEvent.change(textarea, { target: { value: 'test-login' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));

    expect(await screen.findByText('Plan creation failed')).toBeInTheDocument();
  });

  it('dismisses shard plan view when Dismiss is clicked', async () => {
    vi.mocked(api.createShardPlan).mockResolvedValue(mockPlan);
    renderWithClient(<ShardingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Shard Plan' }));

    const textarea = screen.getByLabelText(/test names/i);
    fireEvent.change(textarea, { target: { value: 'test-login\ntest-checkout' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));

    await screen.findByText('Shard Plan');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Shard Plan')).not.toBeInTheDocument();
  });
});
