// TODO: wire up to /api/v1/analytics/* in PR 4
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const analyticsCards = [
  { id: 'pass-rate-trend', title: 'Pass Rate Trend' },
  { id: 'test-durations', title: 'Test Durations' },
  { id: 'flaky-tests', title: 'Flaky Tests' },
  { id: 'error-analysis', title: 'Error Analysis' },
];

const AnalyticsView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <Select defaultValue="30">
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Last 30 days" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {analyticsCards.map(card => (
          <Card key={card.id}>
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AnalyticsView;
