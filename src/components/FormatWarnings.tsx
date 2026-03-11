import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

interface FormatWarningsProps {
  warnings: string[];
  sourceFormat?: string;
  onDismiss?: () => void;
}

const FormatWarnings: React.FC<FormatWarningsProps> = ({ warnings, sourceFormat, onDismiss }) => {
  if (warnings.length === 0) return null;

  return (
    <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
      <AlertTriangle className="h-4 w-4 text-yellow-600" />
      <AlertTitle className="flex items-center gap-2">
        Format Warnings
        {sourceFormat && sourceFormat !== 'ctrf' && (
          <Badge variant="outline" className="text-xs">
            converted from {sourceFormat}
          </Badge>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            aria-label="Dismiss warnings"
          >
            dismiss
          </button>
        )}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 list-disc pl-4 space-y-1 text-sm text-yellow-800 dark:text-yellow-200">
          {warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

export default FormatWarnings;
