import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { TestReport, TestReportsResponse, DashboardFilters } from '../../types/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  RefreshCw,
  Filter,
  BarChart3,
  Clock,
  CheckCircle,
  XCircle,
  SkipForward,
  Circle,
} from 'lucide-react';
import logger from '../../logging/logger';

const TestResultsView: React.FC = () => {
  const { token } = useAuth();
  const [reports, setReports] = useState<TestReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    size: 10,
    total: 0,
    totalPages: 0,
  });

  const [filters, setFilters] = useState<DashboardFilters>({
    status: 'all',
    tool: '',
    environment: '',
    page: 1,
    size: 10,
  });

  // Load reports on component mount and when filters change
  useEffect(() => {
    if (!token) return;

    const fetchReports = async () => {
      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        queryParams.append('page', filters.page.toString());
        queryParams.append('size', filters.size.toString());

        if (filters.status && filters.status !== 'all')
          queryParams.append('status', filters.status);
        if (filters.tool) queryParams.append('tool', filters.tool);
        if (filters.environment) queryParams.append('environment', filters.environment);

        const response = await fetch(`/api/test-reports?${queryParams.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: TestReportsResponse = await response.json();

        if (data.success) {
          setReports(data.data);
          setPagination(
            data.pagination || {
              page: 1,
              size: 10,
              total: data.total || 0,
              totalPages: Math.ceil((data.total || 0) / filters.size),
            }
          );
        } else {
          throw new Error('API returned unsuccessful response');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch test reports');
        setReports([]);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [filters, token]);

  // Function to refresh data manually
  const handleRefresh = useCallback(() => {
    setFilters(prev => ({ ...prev })); // Trigger re-fetch by updating filters object
  }, []);

  // Calculate aggregate statistics from all visible reports
  const calculateSummaryStats = () => {
    if (!Array.isArray(reports) || reports.length === 0) {
      return { tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0, other: 0 };
    }

    const totals = reports.reduce(
      (acc, report) => {
        const summary = report?.results?.summary || {};
        return {
          tests: acc.tests + (summary.tests || 0),
          passed: acc.passed + (summary.passed || 0),
          failed: acc.failed + (summary.failed || 0),
          skipped: acc.skipped + (summary.skipped || 0),
          pending: acc.pending + (summary.pending || 0),
          other: acc.other + (summary.other || 0),
        };
      },
      { tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0, other: 0 }
    );

    return totals;
  };

  const summaryStats = calculateSummaryStats();

  // Handle filter changes
  const handleFilterChange = (key: keyof DashboardFilters, value: string | number) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : (value as number),
    }));
  };

  // Handle page navigation
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      handleFilterChange('page', page);
    }
  };

  // Format duration from milliseconds to readable format
  const formatDuration = (milliseconds: number): string => {
    if (milliseconds < 1000) return `${milliseconds}ms`;
    const seconds = milliseconds / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
  };

  // Format timestamp to readable date
  const formatDate = (isoString: string): string => {
    return new Date(isoString).toLocaleString();
  };

  // Calculate success rate percentage
  const getSuccessRate = (summary: { tests: number; passed: number }): number => {
    if (summary.tests === 0) return 0;
    return Math.round((summary.passed / summary.tests) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1
          id="test-results-title"
          className="text-3xl font-bold tracking-tight flex items-center gap-2"
        >
          <BarChart3 className="h-8 w-8 text-primary" />
          Test Results Dashboard
        </h1>
        <p className="text-muted-foreground">
          Monitor and analyze your CTRF test execution results
        </p>
      </header>

      {/* Summary Statistics */}
      <section aria-labelledby="summary-section">
        <h2 id="summary-section" className="sr-only">
          Summary Statistics
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
              <Circle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.tests}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Passed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">{summaryStats.passed}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summaryStats.failed}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Skipped</CardTitle>
              <SkipForward className="h-4 w-4 text-yellow-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-700">{summaryStats.skipped}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reports</CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {Array.isArray(reports) ? reports.length : 0}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Filters */}
      <section aria-labelledby="filters-section">
        <h2 id="filters-section" className="sr-only">
          Report Filters
        </h2>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <label htmlFor="statusFilter" className="text-sm font-medium">
                  Status
                </label>
                <Select
                  value={filters.status}
                  onValueChange={value => handleFilterChange('status', value)}
                >
                  <SelectTrigger id="statusFilter">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="passed">Passed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="toolFilter" className="text-sm font-medium">
                  Tool
                </label>
                <Input
                  id="toolFilter"
                  type="text"
                  value={filters.tool}
                  onChange={e => handleFilterChange('tool', e.target.value)}
                  placeholder="e.g., Jest, Cypress, Playwright"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="environmentFilter" className="text-sm font-medium">
                  Environment
                </label>
                <Input
                  id="environmentFilter"
                  type="text"
                  value={filters.environment}
                  onChange={e => handleFilterChange('environment', e.target.value)}
                  placeholder="e.g., staging, production"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="pageSizeFilter" className="text-sm font-medium">
                  Per Page
                </label>
                <Select
                  value={filters.size.toString()}
                  onValueChange={value => handleFilterChange('size', parseInt(value))}
                >
                  <SelectTrigger id="pageSizeFilter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="animate-spin">
                <RefreshCw className="h-5 w-5" />
              </div>
              Loading test reports...
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error loading test reports</AlertTitle>
          <AlertDescription className="mt-2">
            {error}
            <div className="mt-3">
              <Button
                onClick={handleRefresh}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Test Reports Table */}
      {!loading && !error && (
        <section aria-labelledby="test-reports-section">
          <h2 id="test-reports-section" className="sr-only">
            Test Reports
          </h2>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Test Reports ({pagination?.total || reports?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No test reports found matching your criteria.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tool</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-center">Tests</TableHead>
                          <TableHead className="text-center">Passed</TableHead>
                          <TableHead className="text-center">Failed</TableHead>
                          <TableHead className="text-center">Skipped</TableHead>
                          <TableHead className="text-right">Duration</TableHead>
                          <TableHead className="text-right">Success Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reports.map((report, index) => {
                          const summary = report?.results?.summary || {};
                          const successRate = getSuccessRate({
                            tests: summary.tests || 0,
                            passed: summary.passed || 0,
                          });
                          const duration = formatDuration(
                            Number(summary.stop || 0) - Number(summary.start || 0)
                          );

                          return (
                            <TableRow
                              key={report?._id || `report-${index}`}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                // TODO: Add navigation to detailed report view
                                logger.info('Navigate to report details', { reportId: report._id });
                              }}
                            >
                              <TableCell className="font-medium">
                                {report?.results?.tool?.name || 'Unknown Tool'}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                  {formatDate(report?.storedAt || '')}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">{summary.tests || 0}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant={summary.passed > 0 ? 'default' : 'secondary'}
                                  className={
                                    summary.passed > 0 ? 'bg-green-500 hover:bg-green-600' : ''
                                  }
                                >
                                  {summary.passed || 0}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={summary.failed > 0 ? 'destructive' : 'secondary'}>
                                  {summary.failed || 0}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant={summary.skipped > 0 ? 'default' : 'secondary'}
                                  className={
                                    summary.skipped > 0 ? 'bg-yellow-500 hover:bg-yellow-600' : ''
                                  }
                                >
                                  {summary.skipped || 0}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {duration}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={
                                    successRate >= 80
                                      ? 'default'
                                      : successRate >= 60
                                        ? 'secondary'
                                        : 'destructive'
                                  }
                                  className={
                                    successRate >= 80
                                      ? 'bg-green-500 hover:bg-green-600'
                                      : successRate >= 60
                                        ? 'bg-yellow-500 hover:bg-yellow-600'
                                        : ''
                                  }
                                >
                                  {successRate}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {(pagination?.totalPages || 0) > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Showing {((pagination?.page || 1) - 1) * (pagination?.size || 10) + 1} to{' '}
                        {Math.min(
                          (pagination?.page || 1) * (pagination?.size || 10),
                          pagination?.total || 0
                        )}{' '}
                        of {pagination?.total || 0} results
                      </div>
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              onClick={() => handlePageChange((pagination?.page || 1) - 1)}
                              className={
                                (pagination?.page || 1) <= 1
                                  ? 'pointer-events-none opacity-50'
                                  : 'cursor-pointer'
                              }
                            />
                          </PaginationItem>

                          {/* Page numbers */}
                          {Array.from(
                            { length: Math.min(5, pagination?.totalPages || 1) },
                            (_, i) => {
                              const currentPage = pagination?.page || 1;
                              const totalPages = pagination?.totalPages || 1;
                              let pageNum;
                              if (totalPages <= 5) {
                                pageNum = i + 1;
                              } else if (currentPage <= 3) {
                                pageNum = i + 1;
                              } else if (currentPage >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                              } else {
                                pageNum = currentPage - 2 + i;
                              }

                              return (
                                <PaginationItem key={pageNum}>
                                  <PaginationLink
                                    onClick={() => handlePageChange(pageNum)}
                                    isActive={pageNum === currentPage}
                                    className="cursor-pointer"
                                  >
                                    {pageNum}
                                  </PaginationLink>
                                </PaginationItem>
                              );
                            }
                          )}

                          {(pagination?.totalPages || 0) > 5 &&
                            (pagination?.page || 1) < (pagination?.totalPages || 1) - 2 && (
                              <PaginationItem>
                                <PaginationEllipsis />
                              </PaginationItem>
                            )}

                          <PaginationItem>
                            <PaginationNext
                              onClick={() => handlePageChange((pagination?.page || 1) + 1)}
                              className={
                                (pagination?.page || 1) >= (pagination?.totalPages || 1)
                                  ? 'pointer-events-none opacity-50'
                                  : 'cursor-pointer'
                              }
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
};

export default TestResultsView;
