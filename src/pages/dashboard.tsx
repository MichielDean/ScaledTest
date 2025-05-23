import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import withAuth from '../auth/withAuth';
import { useAuth } from '../auth/KeycloakProvider';
import { UserRole } from '../auth/keycloak';

const Dashboard: NextPage = () => {
  const { userProfile, hasRole } = useAuth();
  const [content, setContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [newContent, setNewContent] = useState<string>('');

  // Simulate fetching content based on user role
  useEffect(() => {
    const defaultContent =
      'This is some sample content that can be viewed by all authenticated users.';
    setContent(defaultContent);
    setNewContent(defaultContent);
  }, []);

  // Handle content update
  const handleUpdateContent = () => {
    setContent(newContent);
    setIsEditing(false);
  };

  return (
    <div>
      <Head>
        <title>Dashboard - Keycloak Auth Demo</title>
      </Head>

      <Header />

      <main className="container" style={{ padding: '2rem' }}>
        <h1 style={{ marginBottom: '2rem' }}>Dashboard</h1>

        <div id="user-profile-section" className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2>User Profile</h2>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <p>
              <strong>Username:</strong> {userProfile?.username || 'N/A'}
            </p>
            <p>
              <strong>Name:</strong> {userProfile?.firstName || ''} {userProfile?.lastName || ''}
            </p>
            <p>
              <strong>Email:</strong> {userProfile?.email || 'N/A'}
            </p>
            <p>
              <strong>Roles:</strong>
            </p>
            <ul id="user-roles-list">
              {hasRole(UserRole.READONLY) && <li id="role-readonly">Read-only</li>}
              {hasRole(UserRole.MAINTAINER) && <li id="role-maintainer">Maintainer</li>}
              {hasRole(UserRole.OWNER) && <li id="role-owner">Owner</li>}
            </ul>
          </div>
        </div>

        <div id="content-section" className="card" style={{ marginTop: '2rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2>Content Section</h2>
            {(hasRole(UserRole.MAINTAINER) || hasRole(UserRole.OWNER)) && !isEditing && (
              <button id="edit-content-button" onClick={() => setIsEditing(true)}>
                Edit Content
              </button>
            )}
          </div>

          {isEditing ? (
            <div>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '150px',
                  padding: '0.5rem',
                  marginBottom: '1rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                }}
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={handleUpdateContent}>Save Changes</button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setNewContent(content);
                  }}
                  style={{ backgroundColor: '#ff6b6b' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p>{content}</p>
            </div>
          )}
        </div>

        {hasRole(UserRole.OWNER) && (
          <div id="admin-actions-section" className="card" style={{ marginTop: '2rem' }}>
            <h2>Admin Actions</h2>
            <p>This section is only visible to users with the Owner role.</p>
            <button style={{ marginTop: '1rem', backgroundColor: '#ff6b6b' }}>
              Reset Application
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

// Wrap the Dashboard component with the withAuth HOC to protect this route
export default withAuth(Dashboard);
