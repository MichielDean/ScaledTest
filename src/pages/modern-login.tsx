import React from 'react';
import Head from 'next/head';
import { LoginForm } from '@/components/login-form';

export default function ModernLoginPage() {
  return (
    <>
      <Head>
        <title>Sign In - ScaledTest</title>
        <meta name="description" content="Sign in to your ScaledTest account" />
      </Head>
      <main className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm md:max-w-3xl">
          <LoginForm />
        </div>
      </main>
    </>
  );
}
