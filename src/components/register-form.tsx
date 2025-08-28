import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useState, FormEvent } from 'react';
import { Team } from '../types/team';

interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  selectedTeamIds: string[];
}

interface RegisterFormProps {
  availableTeams: Team[];
  loadingTeams: boolean;
  isLoading: boolean;
  error: string;
  onFormSubmit: (data: RegisterFormData) => Promise<void>;
  className?: string;
}

export function RegisterForm({
  availableTeams,
  loadingTeams,
  isLoading,
  error,
  onFormSubmit,
  className,
  ...props
}: RegisterFormProps & React.ComponentProps<'div'>) {
  // Form state only - no business logic
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [validationError, setValidationError] = useState('');

  const validateForm = (): boolean => {
    if (!email || !password) {
      setValidationError('Email and password are required');
      return false;
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return false;
    }

    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters long');
      return false;
    }

    return true;
  };

  const handleTeamSelection = (teamId: string, checked: boolean) => {
    setSelectedTeamIds(prev => (checked ? [...prev, teamId] : prev.filter(id => id !== teamId)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!validateForm()) {
      return;
    }

    // Pass data to parent for business logic handling
    await onFormSubmit({
      email,
      password,
      confirmPassword,
      firstName,
      lastName,
      selectedTeamIds,
    });
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="overflow-hidden">
        <CardContent className="p-6 md:p-8">
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold">Create your account</h1>
                <p className="text-muted-foreground text-balance">
                  Enter your details to get started
                </p>
              </div>

              {(error || validationError) && (
                <div
                  className="bg-destructive/15 text-destructive rounded-md p-3 text-sm"
                  id="registerError"
                >
                  {error || validationError}
                </div>
              )}

              <div className="grid gap-3">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-3">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="grid gap-3">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="grid gap-3">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              {!loadingTeams && availableTeams.length > 0 && (
                <div className="grid gap-3">
                  <Label>Join Teams (Optional)</Label>
                  <p className="text-sm text-muted-foreground">
                    Select teams you&apos;d like to join. You can join more teams later.
                  </p>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {availableTeams.map(team => (
                      <div key={team.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`team-${team.id}`}
                          checked={selectedTeamIds.includes(team.id)}
                          onChange={e => handleTeamSelection(team.id, e.target.checked)}
                          disabled={isLoading}
                          className="rounded border-border text-primary focus:ring-primary"
                        />
                        <Label
                          htmlFor={`team-${team.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          <span className="font-medium">{team.name}</span>
                          {team.description && (
                            <span className="text-muted-foreground"> - {team.description}</span>
                          )}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading} id="registerButton">
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </Button>

              <div className="text-center text-sm">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="underline underline-offset-4 hover:text-primary"
                  id="loginLink"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="text-muted-foreground text-center text-xs text-balance">
        By creating an account, you agree to our{' '}
        <a href="#" className="underline underline-offset-4 hover:text-primary">
          Terms of Service
        </a>{' '}
        and{' '}
        <a href="#" className="underline underline-offset-4 hover:text-primary">
          Privacy Policy
        </a>
        .
      </div>
    </div>
  );
}
