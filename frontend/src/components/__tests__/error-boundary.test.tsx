import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../error-boundary';

describe('ErrorBoundary', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <p>Hello world</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders default error UI when child throws', () => {
    function ThrowingComponent(): React.ReactNode {
      throw new Error('Test explosion');
    }

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test explosion')).toBeInTheDocument();
  });

  it('renders custom fallback when provided and child throws', () => {
    function ThrowingComponent(): React.ReactNode {
      throw new Error('kaboom');
    }

    render(
      <ErrorBoundary fallback={<p>Custom fallback</p>}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
  });

  it('renders Try Again and Reload buttons in default error UI', () => {
    function ThrowingComponent(): React.ReactNode {
      throw new Error('failure');
    }

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('Resetting error boundary allows retry via Try Again', () => {
    let shouldThrow = true;

    function MaybeThrowingComponent(): React.ReactNode {
      if (shouldThrow) {
        throw new Error('failure');
      }
      return <p>Recovered</p>;
    }

    render(
      <ErrorBoundary>
        <MaybeThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});