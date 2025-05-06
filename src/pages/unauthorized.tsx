import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/Header';

const Unauthorized: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Unauthorized - Keycloak Auth Demo</title>
      </Head>

      <Header />

      <main className="container">
        <div className="card" style={{ textAlign: 'center' }}>
          <h1 style={{ color: '#ff6b6b', marginBottom: '1rem' }}>Access Denied</h1>
          
          <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
            You do not have permission to access this page.
          </p>
          
          <Link href="/">
            <button style={{ display: 'inline-block' }}>Return to Home</button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Unauthorized;