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

// Form schema — all string fields as entered. Parallelism is validated as a string
// that must parse to an integer in [1,50]; we convert manually on submit.
// This avoids the react-hook-form + Zod transform type complexity.
const createExecutionSchema = z.object({
  dockerImage: z
    .string()
    .min(1, 'Docker image is required')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]*$/, 'Invalid docker image name'),
  testCommand: z.string().min(1, 'Test command is required').max(1000),
  parallelism: z
    .string()
    .min(1)
    .refine(v => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n >= 1 && n <= 50;
    }, 'Parallelism must be an integer between 1 and 50'),
  teamId: z.string().optional(),
});

type FormInput = z.infer<typeof createExecutionSchema>;

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

  // zodResolver is typed against the schema's input type — use FormInput for useForm
  const form = useForm<FormInput>({
    resolver: zodResolver(createExecutionSchema),
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
          // /api/v1/teams re-exports from /api/teams which returns { data: Team[] }
          const json = (await res.json()) as {
            success?: boolean;
            data?: Team[];
            teams?: Team[]; // fallback for any legacy shape
          };
          if (json.success === false) {
            setTeams([]);
            return;
          }
          setTeams(Array.isArray(json.data) ? json.data : (json.teams ?? []));
        }
      } catch {
        // teams are optional — ignore failures silently
      }
    };
    void load();
  }, [open, token]);

  const onSubmit = async (data: FormInput) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/v1/executions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          dockerImage: data.dockerImage,
          testCommand: data.testCommand,
          parallelism: parseInt(data.parallelism, 10),
          teamId: data.teamId || undefined,
        }),
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
                  <FormLabel htmlFor="execution-docker-image">Docker Image</FormLabel>
                  <FormControl>
                    <Input id="execution-docker-image" placeholder="node:20-alpine" {...field} />
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
                  <FormLabel htmlFor="execution-test-command">Test Command</FormLabel>
                  <FormControl>
                    <Textarea
                      id="execution-test-command"
                      placeholder="npm test"
                      rows={3}
                      {...field}
                    />
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
                  <FormLabel htmlFor="execution-parallelism">Parallelism (1–50)</FormLabel>
                  <FormControl>
                    <Input id="execution-parallelism" type="number" min={1} max={50} {...field} />
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
                    <FormLabel htmlFor="execution-team">Team (optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger id="execution-team">
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
              <Button
                id="execution-cancel-button"
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button id="execution-submit-button" type="submit" disabled={submitting}>
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
