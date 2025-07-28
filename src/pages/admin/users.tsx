import { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { uiLogger as logger } from '../../logging/logger';

const UsersRedirect: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    const redirectToAdmin = async () => {
      try {
        await router.replace('/admin?section=users');
      } catch (error) {
        logger.error('Failed to redirect to admin dashboard', { error, section: 'users' });
      }
    };
    redirectToAdmin();
  }, [router]);

  return <div>Redirecting to admin dashboard...</div>;
};

export default UsersRedirect;
