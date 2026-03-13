/**
 * Component tests for ReportDetailView
 *
 * Covers:
 * - Loading state with skeletons
 * - Report summary statistics display
 * - Test results table with filtering
 * - Test detail expansion (error messages, stack traces, screenshots)
 * - Back navigation
 * - Error state (404, network error)
 * - Environment info display
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

const mockNavigateTo = jest.fn();
const mockGoBack = jest.fn();

jest.mock('../../src/contexts/SPANavigationContext', () => ({
  useSPANavigation: jest.fn(() => ({
    viewParams: { reportId: 'test-report-id' },
    navigateTo: mockNavigateTo,
    goBack: mockGoBack,
    canGoBack: true,
    currentView: 'report-detail',
  })),
}));

jest.mock('../../src/logging/logger', () => ({
  uiLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logError: jest.fn(),
}));

// Mock Select (Radix portals don't render in jsdom)
jest.mock('../../src/components/ui/select', () => ({
  Select: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
    value?: string;
  }) => React.createElement('div', { 'data-testid': 'select', 'data-value': value }, children),
  SelectTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement('button', { 'data-testid': 'select-trigger' }, children),
  SelectContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'select-content' }, children),
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) =>
    React.createElement('div', { 'data-testid': `select-item-${value}` }, children),
  SelectValue: ({ placeholder }: { placeholder?: string }) =>
    React.createElement('span', {}, placeholder || ''),
}));

// Mock Collapsible (Radix primitives don't render well in jsdom)
jest.mock('../../src/components/ui/collapsible', () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'collapsible' }, children),
  CollapsibleTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) =>
    React.createElement('div', { 'data-testid': 'collapsible-trigger' }, children),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'collapsible-content' }, children),
}));

jest.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': `icon-${name}`, ...props });
  return {
    ArrowLeft: icon('arrow-left'),
    CheckCircle: icon('check-circle'),
    XCircle: icon('x-circle'),
    SkipForward: icon('skip-forward'),
    Clock: icon('clock'),
    Timer: icon('timer'),
    ChevronDown: icon('chevron-down'),
    ChevronRight: icon('chevron-right'),
    AlertTriangle: icon('alert-triangle'),
    FileText: icon('file-text'),
    Paperclip: icon('paperclip'),
    Image: icon('image'),
    Tag: icon('tag'),
    GitBranch: icon('git-branch'),
    Box: icon('box'),
  };
});

// ── Imports ──────────────────────────────────────────────────────────────────

import { useAuth } from '../../src/hooks/useAuth';
import { useSPANavigation } from '../../src/contexts/SPANavigationContext';
import ReportDetailView from '../../src/components/views/ReportDetailView';

const mockUseAuth = useAuth as jest.Mock;
const mockUseSPANavigation = useSPANavigation as jest.Mock;

// ── Test Data ────────────────────────────────────────────────────────────────

const sampleReport = {
  success: true,
  data: {
    _id: 'test-report-id',
    reportId: 'test-report-id',
    reportFormat: 'CTRF',
    specVersion: '0.0.1',
    timestamp: '2024-06-01T12:00:00Z',
    storedAt: '2024-06-01T12:00:00Z',
    results: {
      tool: { name: 'Jest', version: '29.7.0' },
      summary: {
        tests: 10,
        passed: 7,
        failed: 2,
        skipped: 1,
        pending: 0,
        other: 0,
        start: 1717243200000,
        stop: 1717243212000,
      },
      tests: [
        {
          name: 'should add numbers',
          status: 'passed',
          duration: 12,
          suite: 'math',
        },
        {
          name: 'should handle errors',
          status: 'failed',
          duration: 45,
          suite: 'error-handling',
          message: 'Expected true to be false',
          trace: 'Error: Expected true to be false\n    at Object.<anonymous> (test.ts:10:5)',
        },
        {
          name: 'should skip old test',
          status: 'skipped',
          duration: 0,
          suite: 'legacy',
        },
      ],
      environment: {
        appName: 'MyApp',
        appVersion: '1.0.0',
        branchName: 'main',
        testEnvironment: 'CI',
      },
    },
  },
};

function setupAuth() {
  mockUseAuth.mockReturnValue({
    token: 'mock-token',
    user: { id: 'u1', email: 'test@example.com', role: 'owner' },
    isAuthenticated: true,
    loading: false,
    hasRole: () => true,
  });
}

function setupNavigation(params: Record<string, string> = { reportId: 'test-report-id' }) {
  mockUseSPANavigation.mockReturnValue({
    viewParams: params,
    navigateTo: mockNavigateTo,
    goBack: mockGoBack,
    canGoBack: true,
    currentView: 'report-detail',
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ReportDetailView — loading', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows skeleton while loading', async () => {
    setupAuth();
    setupNavigation();
    jest.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}) as Promise<Response>);

    render(<ReportDetailView />);

    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);

    (global.fetch as jest.Mock).mockRestore();
  });
});

describe('ReportDetailView — no reportId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows error when no reportId provided', () => {
    setupAuth();
    setupNavigation({});

    render(<ReportDetailView />);

    expect(screen.getByText('No report ID specified.')).toBeInTheDocument();
  });
});

describe('ReportDetailView — error states', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows error on fetch failure', async () => {
    setupAuth();
    setupNavigation();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('Report not found')).toBeInTheDocument();
    });

    (global.fetch as jest.Mock).mockRestore();
  });

  it('shows back button on error', async () => {
    setupAuth();
    setupNavigation();
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.getByText('Back to Test Results')).toBeInTheDocument();

    (global.fetch as jest.Mock).mockRestore();
  });
});

describe('ReportDetailView — report display', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => sampleReport,
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders tool name in header', async () => {
    setupAuth();
    setupNavigation();

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('Jest')).toBeInTheDocument();
    });
  });

  it('renders version in header', async () => {
    setupAuth();
    setupNavigation();

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('v29.7.0')).toBeInTheDocument();
    });
  });

  it('renders summary statistics', async () => {
    setupAuth();
    setupNavigation();

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument(); // Total
    });
    expect(screen.getByText('7')).toBeInTheDocument(); // Passed
    expect(screen.getByText('2')).toBeInTheDocument(); // Failed
    expect(screen.getByText('70%')).toBeInTheDocument(); // Pass Rate
  });

  it('renders environment info', async () => {
    setupAuth();
    setupNavigation();

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('Environment')).toBeInTheDocument();
    });
    expect(screen.getByText(/MyApp/)).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('CI')).toBeInTheDocument();
  });

  it('renders test results in table', async () => {
    setupAuth();
    setupNavigation();

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('should add numbers')).toBeInTheDocument();
    });
    expect(screen.getByText('should handle errors')).toBeInTheDocument();
    expect(screen.getByText('should skip old test')).toBeInTheDocument();
  });

  it('shows test count in results header', async () => {
    setupAuth();
    setupNavigation();

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('Test Results (3)')).toBeInTheDocument();
    });
  });

  it('auto-expands failed tests showing error message', async () => {
    setupAuth();
    setupNavigation();

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('Expected true to be false')).toBeInTheDocument();
    });
  });

  it('shows stack trace for failed tests', async () => {
    setupAuth();
    setupNavigation();

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('Stack Trace')).toBeInTheDocument();
    });
  });

  it('back button calls goBack', async () => {
    setupAuth();
    setupNavigation();

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Back'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('fetches report with correct auth header', async () => {
    setupAuth();
    setupNavigation();

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/v1/reports/test-report-id',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });
  });
});

describe('ReportDetailView — test filtering', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => sampleReport,
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('filters tests by search query', async () => {
    setupAuth();
    setupNavigation();

    render(<ReportDetailView />);

    await waitFor(() => {
      expect(screen.getByText('should add numbers')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search tests by name or suite...');
    await userEvent.type(searchInput, 'error');

    expect(screen.queryByText('should add numbers')).not.toBeInTheDocument();
    expect(screen.getByText('should handle errors')).toBeInTheDocument();
  });
});
