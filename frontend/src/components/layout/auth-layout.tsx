import { Outlet } from '@tanstack/react-router';

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <Outlet />
    </div>
  );
}
