import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth-store';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

export function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const profileMutation = useMutation({
    mutationFn: (name: string) => api.updateProfile(name),
    onSuccess: (updated) => {
      setUser({ id: updated.id, email: updated.email, display_name: updated.display_name, role: updated.role });
      setProfileSuccess('Display name updated.');
      setProfileError('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() });
    },
    onError: (err: Error) => {
      setProfileError(err.message);
      setProfileSuccess('');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      api.changePassword(current, next),
    onSuccess: () => {
      setPasswordSuccess('Password changed successfully.');
      setPasswordError('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: Error) => {
      setPasswordError(err.message);
      setPasswordSuccess('');
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    profileMutation.mutate(displayName);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }

    passwordMutation.mutate({ current: currentPassword, next: newPassword });
  };

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Profile Settings</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Display Name</h2>
        {profileError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400 mb-4">
            {profileError}
          </div>
        )}
        {profileSuccess && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400 mb-4">
            {profileSuccess}
          </div>
        )}
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div>
            <label htmlFor="display-name" className="block text-sm font-medium">
              Display Name
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2"
              required
            />
          </div>
          <button
            type="submit"
            disabled={profileMutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium disabled:opacity-50"
          >
            {profileMutation.isPending ? 'Saving...' : 'Save Name'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Change Password</h2>
        {passwordError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400 mb-4">
            {passwordError}
          </div>
        )}
        {passwordSuccess && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400 mb-4">
            {passwordSuccess}
          </div>
        )}
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label htmlFor="current-password" className="block text-sm font-medium">
              Current Password
            </label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium">
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2"
              required
            />
          </div>
          <button
            type="submit"
            disabled={passwordMutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium disabled:opacity-50"
          >
            {passwordMutation.isPending ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </section>
    </div>
  );
}