import { render, screen, act } from '@testing-library/react';
import { ToastProvider, toast } from '../toast';

describe('ToastProvider', () => {
  it('renders children', () => {
    render(
      <ToastProvider>
        <p>App content</p>
      </ToastProvider>
    );
    expect(screen.getByText('App content')).toBeInTheDocument();
  });

  it('renders error toast when toast is called', () => {
    function TestComponent() {
      return (
        <button onClick={() => toast('Something failed', 'error')}>
          Trigger
        </button>
      );
    }

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      screen.getByRole('button', { name: 'Trigger' }).click();
    });

    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('renders success toast when toast is called with success variant', () => {
    function TestComponent() {
      return (
        <button onClick={() => toast('It worked!', 'success')}>
          Trigger
        </button>
      );
    }

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      screen.getByRole('button', { name: 'Trigger' }).click();
    });

    expect(screen.getByText('It worked!')).toBeInTheDocument();
  });

  it('renders multiple toasts when called multiple times', () => {
    function TestComponent() {
      return (
        <>
          <button onClick={() => toast('Error one', 'error')}>First</button>
          <button onClick={() => toast('Success two', 'success')}>Second</button>
        </>
      );
    }

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      screen.getByRole('button', { name: 'First' }).click();
    });
    act(() => {
      screen.getByRole('button', { name: 'Second' }).click();
    });

    expect(screen.getByText('Error one')).toBeInTheDocument();
    expect(screen.getByText('Success two')).toBeInTheDocument();
  });
});