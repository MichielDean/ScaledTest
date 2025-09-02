import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { BetterAuthProvider } from '../auth/BetterAuthProvider';
import { TeamProvider } from '../contexts/TeamContext';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <BetterAuthProvider>
      <TeamProvider>
        <Component {...pageProps} />
      </TeamProvider>
    </BetterAuthProvider>
  );
}

export default MyApp;
