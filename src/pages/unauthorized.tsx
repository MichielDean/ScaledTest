import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldX, Home, LayoutDashboard } from 'lucide-react';

const Unauthorized: NextPage = () => {
  const router = useRouter();
  const { returnUrl } = router.query;

  return (
    <div>
      <Head>
        <title>Unauthorized - ScaledTest</title>
        <meta name="description" content="Access denied - unauthorized page" />
      </Head>

      <main className="container mx-auto px-4 py-8 min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <ShieldX className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle id="unauthorized-title" className="text-xl font-semibold text-red-600">
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <p id="unauthorized-message" className="text-muted-foreground">
              You do not have permission to access this page.
            </p>

            <div className="flex flex-col gap-3">
              <Link href="/" aria-label="Return to home page">
                <Button className="w-full" variant="default">
                  <Home className="h-4 w-4 mr-2" />
                  Return to Home
                </Button>
              </Link>

              {returnUrl && typeof returnUrl === 'string' && (
                <Link href="/dashboard" aria-label="Go to dashboard page">
                  <Button id="return-to-previous" className="w-full" variant="outline">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Go to Dashboard
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Unauthorized;
