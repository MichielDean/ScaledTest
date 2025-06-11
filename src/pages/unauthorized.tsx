import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../components/Header';

const Unauthorized: NextPage = () => {
  const router = useRouter();
  const { returnUrl } = router.query;

  return (
    <div>
      <Head>
        <title>Unauthorized - Keycloak Auth Demo</title>
      </Head>

      <Header />

      <main id="main-content" className="container">
        <div className="card" style={{ textAlign: 'center' }}>
          <h1 id="unauthorized-title" style={{ color: '#dc3545', marginBottom: '1rem' }}>
            Access Denied
          </h1>

          <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
            You do not have permission to access this page.
          </p>

          <div>
            <Link href="/" aria-label="Return to home page">
              <button
                style={{ display: 'inline-block', marginRight: '1rem' }}
                aria-label="Return to home page"
              >
                Return to Home
              </button>
            </Link>

            {returnUrl && typeof returnUrl === 'string' && (
              <Link href="/dashboard" aria-label="Go to dashboard page">
                <button
                  id="return-to-previous"
                  style={{ display: 'inline-block' }}
                  aria-label="Go to dashboard page"
                >
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
