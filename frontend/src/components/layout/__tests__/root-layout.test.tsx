import { render, screen, fireEvent } from '@testing-library/react';
import { RootLayout } from '../root-layout';

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div data-testid="outlet">page content</div>,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const mockLogout = vi.fn();

vi.mock('../../../hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: '1', email: 'user@test.com', display_name: 'Test User', role: 'member' },
    isAuthenticated: true,
    logout: mockLogout,
  }),
}));

describe('RootLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the sidebar', () => {
    render(<RootLayout />);
    expect(document.querySelector('aside')).toBeInTheDocument();
  });

  it('renders nav items when authenticated', () => {
    render(<RootLayout />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Executions')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('renders the outlet content', () => {
    render(<RootLayout />);
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('renders the user display name', () => {
    render(<RootLayout />);
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('renders the sign out button', () => {
    render(<RootLayout />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('calls logout when sign out button is clicked', () => {
    render(<RootLayout />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('renders the ScaledTest logo link', () => {
    render(<RootLayout />);
    expect(screen.getByText('ScaledTest')).toBeInTheDocument();
  });
});
