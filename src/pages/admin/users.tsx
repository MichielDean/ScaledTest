import { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';

const UsersRedirect: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the unified admin dashboard with users section active
    router.replace('/admin?section=users');
  }, [router]);

  return <div>Redirecting to admin dashboard...</div>;
};

export default UsersRedirect;
