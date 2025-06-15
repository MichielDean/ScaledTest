import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import styles from '../styles/Unauthorized.module.css';
import sharedButtons from '../styles/shared/buttons.module.css';

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
        <div className={`card ${styles.centeredCard}`}>
          <h1 id="unauthorized-title" className={styles.errorTitle}>
            Access Denied
          </h1>

          <p className={styles.description}>You do not have permission to access this page.</p>

          <div className={styles.buttonContainer}>
            <Link href="/" aria-label="Return to home page">
              <button className={sharedButtons.actionButton} aria-label="Return to home page">
                Return to Home
              </button>
            </Link>

            {returnUrl && typeof returnUrl === 'string' && (
              <Link href="/dashboard" aria-label="Go to dashboard page">
                <button
                  id="return-to-previous"
                  className={sharedButtons.actionButton}
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
