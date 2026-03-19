import { useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { api } from '../lib/api';

export function ProfilePage() {
  const { user, setUser } = useAuthStore();

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setProfileLoading(true);
    try {
      const updated = await api.updateProfile(displayName);
      setUser({ id: updated.id, email: updated.email, display_name: updated.display_name, role: updated.role });
      setProfileSuccess('Display name updated.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
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

    setPasswordLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setPasswordLoading(false);
    }
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
            disabled={profileLoading}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium disabled:opacity-50"
          >
            {profileLoading ? 'Saving...' : 'Save Name'}
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
            disabled={passwordLoading}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium disabled:opacity-50"
          >
            {passwordLoading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </section>
    </div>
  );
}
