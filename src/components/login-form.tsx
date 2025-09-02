import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { authLogger as logger } from '../logging/logger';
import { SocialLogin } from '@/components/shared/SocialLogin';

export function LoginForm({ className, ...props }: React.ComponentProps<'div'>) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password');
      setIsLoading(false);
      return;
    }

    try {
      // Use Better Auth for login
      const { signIn } = await import('../lib/auth-client');

      const response = await signIn.email({
        email,
        password,
      });

      if (response.data?.user) {
        logger.info('Login successful with Better Auth', { email });
        // Better Auth handles authentication automatically
        window.location.href = '/dashboard';
      } else if (response.error) {
        logger.error('Login failed', { error: response.error, email });
        setError(response.error.message || 'Invalid email or password');
      }
    } catch (err) {
      logger.error('Login error', { error: err, email });
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold">Welcome back</h1>
                <p className="text-muted-foreground text-balance">
                  Login to your ScaledTest account
                </p>
              </div>
              {error && (
                <div
                  className="bg-destructive/15 text-destructive rounded-md p-3 text-sm"
                  id="loginError"
                >
                  {error}
                </div>
              )}
              <div className="grid gap-3">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="username"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-3">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                </div>
                <PasswordInput
                  id="password"
                  name="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} id="signInButton">
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <SocialLogin
                onSuccess={() => {
                  logger.info('Social login successful');
                  window.location.href = '/dashboard';
                }}
                onError={error => {
                  logger.error('Social login failed', { error });
                  setError(error);
                }}
              />

              <div className="text-center text-sm">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="underline underline-offset-4" id="registerLink">
                  Sign up
                </Link>
              </div>
            </div>
          </form>
          <div className="bg-muted relative hidden md:flex md:items-center md:justify-center">
            <div className="relative h-full w-full max-w-md">
              <Image
                src="/icon.png"
                alt="ScaledTest Logo"
                fill
                className="object-contain dark:brightness-[0.2] dark:grayscale"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
        By clicking continue, you agree to our <a href="#">Terms of Service</a> and{' '}
        <a href="#">Privacy Policy</a>.
      </div>
    </div>
  );
}
