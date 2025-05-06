import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { KeycloakProvider } from '../auth/KeycloakProvider';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <KeycloakProvider>
      <Component {...pageProps} />
    </KeycloakProvider>
  );
}

export default MyApp;