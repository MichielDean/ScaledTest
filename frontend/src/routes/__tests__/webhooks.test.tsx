import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WebhooksPage } from '../webhooks';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    getTeams: vi.fn(),
    getWebhooks: vi.fn(),
    deleteWebhook: vi.fn(),
    createWebhook: vi.fn(),
    updateWebhook: vi.fn(),
    getWebhookDeliveries: vi.fn(),
    retryWebhookDelivery: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const mockTeams = { teams: [{ id: 'team-1', name: 'Test Team' }] };

const mockWebhooks = {
  webhooks: [
    {
      id: 'wh-1',
      team_id: 'team-1',
      url: 'https://example.com/hook',
      events: ['report.submitted'],
      enabled: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  total: 1,
};

const mockDeliveries = {
  deliveries: [
    {
      id: 'del-1',
      webhook_id: 'wh-1',
      url: 'https://example.com/hook',
      event_type: 'report.submitted',
      attempt: 1,
      status_code: 200,
      duration_ms: 123,
      delivered_at: '2026-01-01T01:00:00Z',
    },
    {
      id: 'del-2',
      webhook_id: 'wh-1',
      url: 'https://example.com/hook',
      event_type: 'gate.failed',
      attempt: 1,
      status_code: 500,
      error: 'Internal Server Error',
      duration_ms: 456,
      delivered_at: '2026-01-01T02:00:00Z',
    },
  ],
  total: 2,
};

describe('WebhooksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the webhooks heading', async () => {
    vi.mocked(api.getTeams).mockResolvedValue(mockTeams);
    vi.mocked(api.getWebhooks).mockResolvedValue({ webhooks: [], total: 0 });

    renderWithClient(<WebhooksPage />);
    expect(await screen.findByRole('heading', { name: 'Webhooks' })).toBeInTheDocument();
  });

  it('shows no-team message when user has no team', async () => {
    vi.mocked(api.getTeams).mockResolvedValue({ teams: [] });

    renderWithClient(<WebhooksPage />);
    expect(await screen.findByText('No team found')).toBeInTheDocument();
  });

  it('shows empty state when there are no webhooks', async () => {
    vi.mocked(api.getTeams).mockResolvedValue(mockTeams);
    vi.mocked(api.getWebhooks).mockResolvedValue({ webhooks: [], total: 0 });

    renderWithClient(<WebhooksPage />);
    expect(await screen.findByText('No webhooks yet')).toBeInTheDocument();
  });

  it('renders webhook cards with url and status', async () => {
    vi.mocked(api.getTeams).mockResolvedValue(mockTeams);
    vi.mocked(api.getWebhooks).mockResolvedValue(mockWebhooks);

    renderWithClient(<WebhooksPage />);
    expect(await screen.findByText('https://example.com/hook')).toBeInTheDocument();
    expect(await screen.findByText('Active')).toBeInTheDocument();
  });

  it('shows delivery list when Deliveries button is clicked', async () => {
    vi.mocked(api.getTeams).mockResolvedValue(mockTeams);
    vi.mocked(api.getWebhooks).mockResolvedValue(mockWebhooks);
    vi.mocked(api.getWebhookDeliveries).mockResolvedValue(mockDeliveries);

    renderWithClient(<WebhooksPage />);

    const deliveriesBtn = await screen.findByRole('button', { name: /deliveries/i });
    fireEvent.click(deliveriesBtn);

    expect(await screen.findByText('200')).toBeInTheDocument();
    expect(await screen.findByText('500')).toBeInTheDocument();
  });

  it('shows Retry button only for non-2xx deliveries', async () => {
    vi.mocked(api.getTeams).mockResolvedValue(mockTeams);
    vi.mocked(api.getWebhooks).mockResolvedValue(mockWebhooks);
    vi.mocked(api.getWebhookDeliveries).mockResolvedValue(mockDeliveries);

    renderWithClient(<WebhooksPage />);

    const deliveriesBtn = await screen.findByRole('button', { name: /deliveries/i });
    fireEvent.click(deliveriesBtn);

    const retryButtons = await screen.findAllByRole('button', { name: /^retry$/i });
    // Only the 500 delivery should have a Retry button
    expect(retryButtons).toHaveLength(1);
  });

  it('calls retryWebhookDelivery with correct args when Retry is clicked', async () => {
    vi.mocked(api.getTeams).mockResolvedValue(mockTeams);
    vi.mocked(api.getWebhooks).mockResolvedValue(mockWebhooks);
    vi.mocked(api.getWebhookDeliveries).mockResolvedValue(mockDeliveries);
    vi.mocked(api.retryWebhookDelivery).mockResolvedValue({
      success: true,
      status_code: 200,
      attempt: 2,
      duration_ms: 100,
      error: '',
    });

    renderWithClient(<WebhooksPage />);

    const deliveriesBtn = await screen.findByRole('button', { name: /deliveries/i });
    fireEvent.click(deliveriesBtn);

    const retryBtn = await screen.findByRole('button', { name: /^retry$/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(api.retryWebhookDelivery).toHaveBeenCalledWith('team-1', 'wh-1', 'del-2');
    });
  });

  it('shows error message when retry fails', async () => {
    vi.mocked(api.getTeams).mockResolvedValue(mockTeams);
    vi.mocked(api.getWebhooks).mockResolvedValue(mockWebhooks);
    vi.mocked(api.getWebhookDeliveries).mockResolvedValue(mockDeliveries);
    vi.mocked(api.retryWebhookDelivery).mockRejectedValue(new Error('Network error'));

    renderWithClient(<WebhooksPage />);

    const deliveriesBtn = await screen.findByRole('button', { name: /deliveries/i });
    fireEvent.click(deliveriesBtn);

    const retryBtn = await screen.findByRole('button', { name: /^retry$/i });
    fireEvent.click(retryBtn);

    expect(await screen.findByText(/retry failed/i)).toBeInTheDocument();
  });

  it('shows 0 for status_code 0 instead of dash', async () => {
    const deliveriesWithZero = {
      deliveries: [
        {
          id: 'del-3',
          webhook_id: 'wh-1',
          url: 'https://example.com/hook',
          event_type: 'report.submitted',
          attempt: 1,
          status_code: 0,
          error: 'connection refused',
          duration_ms: 0,
          delivered_at: '2026-01-01T03:00:00Z',
        },
      ],
      total: 1,
    };
    vi.mocked(api.getTeams).mockResolvedValue(mockTeams);
    vi.mocked(api.getWebhooks).mockResolvedValue(mockWebhooks);
    vi.mocked(api.getWebhookDeliveries).mockResolvedValue(deliveriesWithZero);

    renderWithClient(<WebhooksPage />);

    const deliveriesBtn = await screen.findByRole('button', { name: /deliveries/i });
    fireEvent.click(deliveriesBtn);

    expect(await screen.findByText('0')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('hides delivery list when Deliveries button is clicked again', async () => {
    vi.mocked(api.getTeams).mockResolvedValue(mockTeams);
    vi.mocked(api.getWebhooks).mockResolvedValue(mockWebhooks);
    vi.mocked(api.getWebhookDeliveries).mockResolvedValue(mockDeliveries);

    renderWithClient(<WebhooksPage />);

    const deliveriesBtn = await screen.findByRole('button', { name: /deliveries/i });
    fireEvent.click(deliveriesBtn);

    expect(await screen.findByText('200')).toBeInTheDocument();

    fireEvent.click(deliveriesBtn);

    await waitFor(() => {
      expect(screen.queryByText('200')).not.toBeInTheDocument();
    });
  });
});
