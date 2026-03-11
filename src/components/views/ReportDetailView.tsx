import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useSPANavigation } from '../../contexts/SPANavigationContext';
import { TestReport } from '../../types/dashboard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  SkipForward,
  Clock,
  Timer,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  FileText,
  Paperclip,
  Image,
  Tag,
  GitBranch,
  Box,
} from 'lucide-react';

type TestResult = TestReport['results']['tests'][0];

const ReportDetailView: React.FC = () => {
  const { token } = useAuth();
  const { viewParams, navigateTo, goBack, canGoBack } = useSPANavigation();
  const rawReportId = viewParams.reportId;
  // Validate reportId to prevent SSRF via path traversal
  const reportId = rawReportId && /^[a-zA-Z0-9_-]+$/.test(rawReportId) ? rawReportId : undefined;

  const [report, setReport] = useState<TestReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Test filtering state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTests, setExpandedTests] = useState<Set<number>>(new Set());

  // Fetch report
  useEffect(() => {
    if (!token || !reportId) return;

    const fetchReport = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/v1/reports/${encodeURIComponent(reportId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 404) throw new Error('Report not found');
          throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
          setReport(data.data);
        } else {
          throw new Error(data.error || 'Failed to load report');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch report');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [token, reportId]);

  // Filtered tests — map with original index first to avoid O(n²) indexOf calls
  const filteredTests = useMemo(() => {
    if (!report?.results?.tests) return [];
    return report.results.tests
      .map((test, originalIndex) => ({ test, originalIndex }))
      .filter(({ test }) => {
        const matchesStatus = statusFilter === 'all' || test.status === statusFilter;
        const matchesSearch =
          !searchQuery ||
          test.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (test.suite && test.suite.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesStatus && matchesSearch;
      });
  }, [report, statusFilter, searchQuery]);

  // Toggle test expansion
  const toggleTest = (index: number) => {
    setExpandedTests(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Expand all failed tests by default on load
  useEffect(() => {
    if (report?.results?.tests) {
      const failedIndices = new Set<number>();
      report.results.tests.forEach((test, i) => {
        if (test.status === 'failed') failedIndices.add(i);
      });
      setExpandedTests(failedIndices);
    }
  }, [report]);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${(s % 60).toFixed(1)}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'skipped':
        return <SkipForward className="h-4 w-4 text-yellow-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
      passed: 'default',
      failed: 'destructive',
      skipped: 'secondary',
      pending: 'outline',
      other: 'secondary',
    };
    const colors: Record<string, string> = {
      passed: 'bg-green-500 hover:bg-green-600',
      skipped: 'bg-yellow-500 hover:bg-yellow-600',
    };
    return (
      <Badge variant={variants[status] || 'secondary'} className={colors[status] || ''}>
        {status}
      </Badge>
    );
  };

  if (!reportId) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>No report ID specified.</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => navigateTo('test-results')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Test Results
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          onClick={() => (canGoBack ? goBack() : navigateTo('test-results'))}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Test Results
        </Button>
      </div>
    );
  }

  if (!report) return null;

  const summary = report.results?.summary;
  const env = report.results?.environment;
  const tool = report.results?.tool;
  const totalDuration = (summary?.stop || 0) - (summary?.start || 0);
  const passRate = summary?.tests ? Math.round((summary.passed / summary.tests) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => (canGoBack ? goBack() : navigateTo('test-results'))}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            {tool?.name || 'Test Report'}
            {tool?.version && (
              <span className="text-base font-normal text-muted-foreground">v{tool.version}</span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {report.timestamp ? new Date(report.timestamp).toLocaleString() : 'Unknown date'}
            {report.reportId && (
              <span className="ml-2 font-mono text-xs opacity-60">
                {report.reportId.slice(0, 8)}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.tests || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Passed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary?.passed || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary?.failed || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Skipped</CardTitle>
            <SkipForward className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{summary?.skipped || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${passRate >= 80 ? 'text-green-600' : passRate >= 60 ? 'text-yellow-600' : 'text-red-600'}`}
            >
              {passRate}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(totalDuration)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Environment Info */}
      {env && Object.keys(env).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Box className="h-4 w-4" />
              Environment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4 text-sm">
              {env.appName && (
                <div>
                  <span className="text-muted-foreground">App:</span>{' '}
                  <span className="font-medium">
                    {env.appName}
                    {env.appVersion && ` v${env.appVersion}`}
                  </span>
                </div>
              )}
              {env.branchName && (
                <div className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{env.branchName}</span>
                </div>
              )}
              {env.buildName && (
                <div>
                  <span className="text-muted-foreground">Build:</span>{' '}
                  <span className="font-medium">
                    {env.buildName}
                    {env.buildNumber && ` #${env.buildNumber}`}
                  </span>
                </div>
              )}
              {env.testEnvironment && (
                <div>
                  <span className="text-muted-foreground">Env:</span>{' '}
                  <span className="font-medium">{env.testEnvironment}</span>
                </div>
              )}
              {env.osPlatform && (
                <div>
                  <span className="text-muted-foreground">OS:</span>{' '}
                  <span className="font-medium">
                    {env.osPlatform}
                    {env.osVersion && ` ${env.osVersion}`}
                  </span>
                </div>
              )}
              {env.commit && (
                <div>
                  <span className="text-muted-foreground">Commit:</span>{' '}
                  <span className="font-mono font-medium">{env.commit.slice(0, 8)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Results */}
      <Card>
        <CardHeader>
          <CardTitle>Test Results ({filteredTests.length})</CardTitle>
          <CardDescription>
            Click a test to view error details, stack traces, and attachments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4 flex-wrap">
            <div className="w-40">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 max-w-sm">
              <Input
                placeholder="Search tests by name or suite..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Test Table */}
          {filteredTests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No tests matching your criteria.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Test Name</TableHead>
                    <TableHead>Suite</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTests.map(({ test, originalIndex }) => {
                    const isExpanded = expandedTests.has(originalIndex);
                    const hasDetails =
                      test.message ||
                      test.trace ||
                      test.screenshot ||
                      test.attachments?.length ||
                      test.stdout?.length ||
                      test.stderr?.length ||
                      test.steps?.length;

                    return (
                      <React.Fragment key={originalIndex}>
                        <TableRow
                          className={`hover:bg-muted/50 ${isExpanded ? 'bg-muted/30' : ''} ${hasDetails ? 'cursor-pointer' : ''}`}
                          onClick={() => hasDetails && toggleTest(originalIndex)}
                          role={hasDetails ? 'button' : undefined}
                          tabIndex={hasDetails ? 0 : undefined}
                          aria-expanded={hasDetails ? isExpanded : undefined}
                          onKeyDown={
                            hasDetails
                              ? e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggleTest(originalIndex);
                                  }
                                }
                              : undefined
                          }
                        >
                          <TableCell className="w-8">
                            {hasDetails ? (
                              isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )
                            ) : (
                              <span className="w-4 inline-block" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(test.status)}
                              <span className="truncate max-w-md">{test.name}</span>
                              {test.flaky && (
                                <Badge variant="outline" className="text-xs">
                                  flaky
                                </Badge>
                              )}
                              {test.retries != null && test.retries > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {test.retries} retries
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {test.suite || '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            {getStatusBadge(test.status)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatDuration(test.duration)}
                          </TableCell>
                        </TableRow>

                        {/* Expanded detail row */}
                        {isExpanded && hasDetails && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/20 p-0">
                              <TestDetailPanel test={test} />
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ── Test Detail Panel ────────────────────────────────────────────────────────

interface TestDetailPanelProps {
  test: TestResult;
}

const isSafeUrl = (url: string): boolean => /^https?:\/\//i.test(url);

const TestDetailPanel: React.FC<TestDetailPanelProps> = ({ test }) => {
  return (
    <div className="p-4 space-y-4">
      {/* Error Message */}
      {test.message && (
        <div>
          <h4 className="text-sm font-semibold text-red-600 mb-1 flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Error Message
          </h4>
          <pre className="text-sm bg-background border rounded-md p-3 overflow-x-auto whitespace-pre-wrap font-mono">
            {test.message}
          </pre>
        </div>
      )}

      {/* Stack Trace */}
      {test.trace && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]_&]:rotate-90" />
              Stack Trace
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="text-xs bg-background border rounded-md p-3 overflow-x-auto whitespace-pre-wrap font-mono mt-1 max-h-80 overflow-y-auto">
              {test.trace}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Screenshot */}
      {test.screenshot && (
        <div>
          <h4 className="text-sm font-semibold mb-1 flex items-center gap-1">
            <Image className="h-3 w-3" />
            Screenshot
          </h4>
          {test.screenshot.startsWith('data:') ? (
            <img
              src={test.screenshot}
              alt="Test failure screenshot"
              className="rounded-md border max-w-full max-h-96 object-contain"
            />
          ) : isSafeUrl(test.screenshot) ? (
            <a
              href={test.screenshot}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              {test.screenshot}
            </a>
          ) : (
            <span className="text-sm text-muted-foreground font-mono">{test.screenshot}</span>
          )}
        </div>
      )}

      {/* stdout / stderr */}
      {test.stdout && test.stdout.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]_&]:rotate-90" />
              stdout ({test.stdout.length} lines)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="text-xs bg-background border rounded-md p-3 overflow-x-auto whitespace-pre-wrap font-mono mt-1 max-h-60 overflow-y-auto">
              {test.stdout.join('\n')}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {test.stderr && test.stderr.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-red-600">
              <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]_&]:rotate-90" />
              stderr ({test.stderr.length} lines)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md p-3 overflow-x-auto whitespace-pre-wrap font-mono mt-1 max-h-60 overflow-y-auto">
              {test.stderr.join('\n')}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Steps */}
      {test.steps && test.steps.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Steps</h4>
          <div className="space-y-1">
            {test.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-sm pl-2">
                {step.status === 'passed' ? (
                  <CheckCircle className="h-3 w-3 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-600 shrink-0" />
                )}
                <span>{step.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attachments */}
      {test.attachments && test.attachments.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            Attachments ({test.attachments.length})
          </h4>
          <div className="space-y-1">
            {test.attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                {isSafeUrl(att.path) ? (
                  <a
                    href={att.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {att.name}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{att.name}</span>
                )}
                <span className="text-muted-foreground text-xs">({att.contentType})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {test.tags && test.tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="h-3 w-3 text-muted-foreground" />
          {test.tags.map((tag, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Metadata row */}
      <div className="flex gap-4 flex-wrap text-xs text-muted-foreground pt-2 border-t">
        {test.browser && <span>Browser: {test.browser}</span>}
        {test.device && <span>Device: {test.device}</span>}
        {test.filePath && (
          <span className="font-mono">
            {test.filePath}
            {test.line ? `:${test.line}` : ''}
          </span>
        )}
        {test.threadId && <span>Thread: {test.threadId}</span>}
      </div>
    </div>
  );
};

export default ReportDetailView;
