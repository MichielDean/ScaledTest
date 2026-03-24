import { render, screen } from '@testing-library/react';
import { AuthLayout } from '../auth-layout';

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div data-testid="outlet">page content</div>,
}));

describe('AuthLayout', () => {
  it('renders the outlet', () => {
    render(<AuthLayout />);
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('does not render a sidebar', () => {
    render(<AuthLayout />);
    expect(document.querySelector('aside')).not.toBeInTheDocument();
  });

  it('does not render nav items', () => {
    render(<AuthLayout />);
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
    expect(screen.queryByText('Executions')).not.toBeInTheDocument();
  });

  it('does not render a sign out button', () => {
    render(<AuthLayout />);
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });
});
