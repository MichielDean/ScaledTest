import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../components/Header';

const Unauthorized: NextPage = () => {
  const router = useRouter();
  // Get the returnUrl from the query parameters if available
  const { returnUrl } = router.query;

  return (
    <div>
      <Head>
        <title>Unauthorized - Keycloak Auth Demo</title>
      </Head>

      <Header />

      <main className="container">
        <div className="card" style={{ textAlign: 'center' }}>
          <h1 id="unauthorized-title" style={{ color: '#ff6b6b', marginBottom: '1rem' }}>
            Access Denied
          </h1>

          <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
            You do not have permission to access this page.
          </p>

          <div>
            <Link href="/">
              <button style={{ display: 'inline-block', marginRight: '1rem' }}>
                Return to Home
              </button>
            </Link>

            {returnUrl && typeof returnUrl === 'string' && (
              <Link href="/dashboard">
                <button id="return-to-previous" style={{ display: 'inline-block' }}>
                  Go to Dashboard
                </button>
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Unauthorized;
