import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { KeycloakProvider } from '../auth/KeycloakProvider';
import { TeamProvider } from '../contexts/TeamContext';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <KeycloakProvider>
      <TeamProvider>
        <Component {...pageProps} />
      </TeamProvider>
    </KeycloakProvider>
  );
}

export default MyApp;
