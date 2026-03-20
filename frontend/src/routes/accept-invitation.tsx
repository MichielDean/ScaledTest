import { useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { api } from '../lib/api';

interface InvitationPreview {
  email: string;
  role: string;
  team_name: string;
  expires_at: string;
}

export function AcceptInvitationPage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const navigate = useNavigate();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .previewInvitation(token, controller.signal)
      .then((data: unknown) => {
        setPreview(data as InvitationPreview);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load invitation');
      })
      .finally(() => {
        setLoading(false);
      });
    return () => controller.abort();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (password.length < 8) {
      setSubmitError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await api.acceptInvitation(token, password, displayName);
      navigate({ to: '/login' });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading invitation...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">ScaledTest</h1>
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {loadError}
          </div>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">ScaledTest</h1>
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            Invitation not found
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">ScaledTest</h1>
          <p className="text-muted-foreground">You have been invited to join a team</p>
        </div>

        <div className="rounded-md border bg-muted/40 p-4 text-sm space-y-1">
          <div>
            <span className="font-medium">Team: </span>
            <span>{preview!.team_name}</span>
          </div>
          <div>
            <span className="font-medium">Email: </span>
            <span>{preview!.email}</span>
          </div>
          <div>
            <span className="font-medium">Role: </span>
            <span>{preview!.role}</span>
          </div>
          <div>
            <span className="font-medium">Expires: </span>
            <span>{new Date(preview!.expires_at).toLocaleString()}</span>
          </div>
        </div>

        {submitError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2"
              required
              minLength={8}
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium disabled:opacity-50"
          >
            {submitting ? 'Accepting...' : 'Accept Invitation'}
          </button>
        </form>
      </div>
    </div>
  );
}
