import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '../stores/auth-store';

export function OAuthCallbackPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const errorParam = params.get('error');

    if (errorParam) {
      setError(errorParam);
      return;
    }

    if (token) {
      // Decode user info directly from the JWT payload (no /auth/me round-trip needed).
      try {
        const parts = token.split('.');
        if (parts.length !== 3 || !parts[1]) {
          setError('OAuth login failed: malformed token');
          return;
        }
        const payload = JSON.parse(atob(parts[1]));
        const user = {
          id: payload.sub,
          email: payload.email,
          display_name: payload.display_name || payload.email,
          role: payload.role || 'member',
        };
        setAuth(user, token);
        navigate({ to: '/' });
      } catch {
        setError('OAuth login failed: invalid token');
      }
    } else {
      setError('No authentication token received');
    }
  }, [navigate, setAuth]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-600">Authentication Error</h1>
          <p className="text-muted-foreground">{error}</p>
          <a href="/login" className="text-primary hover:underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Completing sign in...</p>
    </div>
  );
}
