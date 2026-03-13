import { useAuthStore, type User } from '../auth-store';

const testUser: User = {
  id: 'u1',
  email: 'test@example.com',
  display_name: 'Test User',
  role: 'member',
};

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    });
  });

  it('starts unauthenticated with no user', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('setAuth stores user, token, and sets isAuthenticated', () => {
    useAuthStore.getState().setAuth(testUser, 'tok_abc');

    const state = useAuthStore.getState();
    expect(state.user).toEqual(testUser);
    expect(state.accessToken).toBe('tok_abc');
    expect(state.isAuthenticated).toBe(true);
  });

  it('clearAuth resets to unauthenticated state', () => {
    useAuthStore.getState().setAuth(testUser, 'tok_abc');
    useAuthStore.getState().clearAuth();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('setAuth overwrites previous user and token', () => {
    useAuthStore.getState().setAuth(testUser, 'tok_1');

    const otherUser: User = { ...testUser, id: 'u2', email: 'other@example.com' };
    useAuthStore.getState().setAuth(otherUser, 'tok_2');

    const state = useAuthStore.getState();
    expect(state.user).toEqual(otherUser);
    expect(state.accessToken).toBe('tok_2');
    expect(state.isAuthenticated).toBe(true);
  });
});
