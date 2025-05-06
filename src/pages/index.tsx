import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/Header';
import { useAuth } from '../auth/KeycloakProvider';

const Home: NextPage = () => {
  const { isAuthenticated, login } = useAuth();

  return (
    <div>
      <Head>
        <title>Keycloak Auth Demo</title>
        <meta name="description" content="Next.js application with Keycloak authentication" />
      </Head>

      <Header />

      <main className="container">
        <h1 style={{ marginBottom: '2rem' }}>
          Welcome to the Keycloak Authentication Demo
        </h1>

        <div className="card">
          <h2>Role-Based Access Control with Keycloak</h2>
          <p style={{ margin: '1rem 0' }}>
            This demo shows how to implement authentication and role-based access control 
            using Keycloak in a Next.js application.
          </p>
          <p style={{ margin: '1rem 0' }}>
            There are three roles in this application:
          </p>
          <ul style={{ marginLeft: '2rem' }}>
            <li><strong>Read-only:</strong> Can only view content</li>
            <li><strong>Maintainer:</strong> Can view and edit some content</li>
            <li><strong>Owner:</strong> Has full access to all features</li>
          </ul>

          {isAuthenticated ? (
            <Link href="/dashboard">
              <button style={{ marginTop: '1rem' }}>Go to Dashboard</button>
            </Link>
          ) : (
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button onClick={login}>Login</button>
              <Link href="/register">
                <button style={{ backgroundColor: '#4CAF50' }}>Register</button>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Home;