import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/hooks/useAuth';

const createExecutionSchema = z.object({
  dockerImage: z
    .string()
    .min(1, 'Docker image is required')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]*$/, 'Invalid docker image name'),
  testCommand: z.string().min(1, 'Test command is required').max(1000),
  // Keep as string to avoid coerce issues; we convert on submit
  parallelism: z
    .string()
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().min(1, 'Min 1').max(50, 'Max 50')),
  teamId: z.string().optional(),
});

type FormData = {
  dockerImage: string;
  testCommand: string;
  parallelism: string;
  teamId?: string;
};

type SubmitData = {
  dockerImage: string;
  testCommand: string;
  parallelism: number;
  teamId?: string;
};

interface Team {
  id: string;
  name: string;
}

interface CreateExecutionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateExecutionModal: React.FC<CreateExecutionModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { token } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createExecutionSchema) as any,
    defaultValues: {
      dockerImage: '',
      testCommand: '',
      parallelism: '1',
    },
  });

  // Load teams for the select
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        const res = await fetch('/api/v1/teams', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const json = (await res.json()) as { teams?: Team[] };
          setTeams(json.teams ?? []);
        }
      } catch {
        // teams are optional — ignore
      }
    };
    void load();
  }, [open, token]);

  const onSubmit = async (raw: FormData) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const data: SubmitData = {
        ...raw,
        parallelism: parseInt(raw.parallelism, 10),
        teamId: raw.teamId || undefined,
      };

      const res = await fetch('/api/v1/executions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? `Request failed: ${res.status}`);
      }
      form.reset();
      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create execution');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Run Tests</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="dockerImage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Docker Image</FormLabel>
                  <FormControl>
                    <Input placeholder="node:20-alpine" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="testCommand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Test Command</FormLabel>
                  <FormControl>
                    <Textarea placeholder="npm test" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parallelism"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parallelism (1–50)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={50} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {teams.length > 0 && (
              <FormField
                control={form.control}
                name="teamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team (optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No team" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {teams.map(team => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Run Tests'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateExecutionModal;
