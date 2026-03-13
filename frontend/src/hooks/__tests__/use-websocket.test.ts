import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../use-websocket';
import { useAuthStore } from '../../stores/auth-store';

// --- WebSocket mock infrastructure ---

type WSListener = ((event: { data: string }) => void) | (() => void);

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closeCalled = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closeCalled = true;
  }

  // Test helpers
  simulateOpen() {
    this.onopen?.();
  }
  simulateClose() {
    this.onclose?.();
  }
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useWebSocket', () => {
  it('does not connect without a token', () => {
    renderHook(() => useWebSocket());
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('connects when token is present', () => {
    useAuthStore.setState({ accessToken: 'tok' });

    renderHook(() => useWebSocket());
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain('token=tok');
  });

  it('includes execution_id in URL when provided', () => {
    useAuthStore.setState({ accessToken: 'tok' });

    renderHook(() => useWebSocket('exec-123'));
    const url = MockWebSocket.instances[0].url;
    expect(url).toContain('execution_id=exec-123');
  });

  it('sets isConnected true on open, false on close', () => {
    useAuthStore.setState({ accessToken: 'tok' });

    const { result } = renderHook(() => useWebSocket());
    expect(result.current.isConnected).toBe(false);

    act(() => MockWebSocket.instances[0].simulateOpen());
    expect(result.current.isConnected).toBe(true);

    act(() => MockWebSocket.instances[0].simulateClose());
    expect(result.current.isConnected).toBe(false);
  });

  it('parses incoming messages into lastMessage', () => {
    useAuthStore.setState({ accessToken: 'tok' });

    const { result } = renderHook(() => useWebSocket());
    act(() => MockWebSocket.instances[0].simulateOpen());

    const msg = {
      type: 'status_update',
      execution_id: 'e1',
      data: { status: 'running' },
      timestamp: '2026-01-01T00:00:00Z',
    };

    act(() => MockWebSocket.instances[0].simulateMessage(msg));
    expect(result.current.lastMessage).toEqual(msg);
  });

  it('reconnects after close with a 3s delay', () => {
    useAuthStore.setState({ accessToken: 'tok' });

    renderHook(() => useWebSocket());
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => MockWebSocket.instances[0].simulateClose());
    expect(MockWebSocket.instances).toHaveLength(1); // not yet

    act(() => vi.advanceTimersByTime(3000));
    expect(MockWebSocket.instances).toHaveLength(2); // reconnected
  });

  it('closes websocket and cancels reconnect on unmount', () => {
    useAuthStore.setState({ accessToken: 'tok' });

    const { unmount } = renderHook(() => useWebSocket());
    const ws = MockWebSocket.instances[0];

    act(() => ws.simulateOpen());
    unmount();

    expect(ws.closeCalled).toBe(true);

    // Simulate the close callback firing after unmount
    act(() => ws.simulateClose());
    act(() => vi.advanceTimersByTime(5000));
    // Should not have reconnected
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
