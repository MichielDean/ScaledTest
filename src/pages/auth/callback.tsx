import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from '@/lib/auth-client';
import { apiLogger } from '@/logging/logger';

export default function AuthCallback() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) return; // Still loading

    if (session) {
      // User is authenticated, redirect to dashboard
      apiLogger.info('Social auth callback successful', {
        userId: session.user.id,
        provider: router.query.provider,
      });
      router.push('/dashboard');
    } else {
      // Authentication failed, redirect to login with error
      apiLogger.error('Social auth callback failed', {
        provider: router.query.provider,
      });
      router.push('/login?error=social_auth_failed');
    }
  }, [session, isPending, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-lg font-medium">Completing authentication...</p>
        <p className="text-muted-foreground">Please wait while we sign you in.</p>
      </div>
    </div>
  );
}
