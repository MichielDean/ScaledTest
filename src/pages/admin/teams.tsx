import { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';

const TeamsRedirect: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the unified admin dashboard with teams section active
    router.replace('/admin?section=teams');
  }, [router]);

  return <div>Redirecting to admin dashboard...</div>;
};

export default TeamsRedirect;
