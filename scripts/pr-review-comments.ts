import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import logger from '../src/logging/logger';

const execFileAsync = promisify(execFile);

interface CommentNode {
  id?: string;
  body?: string;
  author?: { login?: string } | null;
  path?: string | null;
  line?: number | null;
  originalLine?: number | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  draftedAt?: string | null;
  isMinimized?: boolean | null;
  minimizedReason?: string | null;
  outdated?: boolean | null;
  state?: string | null;
  viewerCanDelete?: boolean | null;
  viewerCanMinimize?: boolean | null;
  viewerDidAuthor?: boolean | null;
  replyTo?: { id?: string } | null;
  url?: string | null;
}

interface ReviewThreadNode {
  id?: string;
  isResolved?: boolean;
  isCollapsed?: boolean | null;
  isOutdated?: boolean | null;
  resolvedBy?: { login?: string } | null;
  viewerCanReply?: boolean | null;
  viewerCanResolve?: boolean | null;
  viewerCanUnresolve?: boolean | null;
  comments?: { nodes?: CommentNode[] } | null;
}

interface GraphQLResponse {
  data?: {
    repository?: {
      pullRequest?: {
        reviewThreads?: {
          nodes?: ReviewThreadNode[];
        } | null;
      } | null;
    } | null;
  } | null;
}

async function fetchReviewThreads(prNumber: number): Promise<ReviewThreadNode[]> {
  const query = `
        query {
            repository(owner: "MichielDean", name: "ScaledTest") {
                pullRequest(number: ${prNumber}) {
                    reviewThreads(last: 50) {
                        nodes {
                            id
                            isResolved
                            isCollapsed
                            isOutdated
                            resolvedBy { login }
                            viewerCanReply
                            viewerCanResolve
                            viewerCanUnresolve
                            comments(first: 50) {
                                nodes {
                                    id
                                    body
                                    author { login }
                                    path
                                    line
                                    originalLine
                                    createdAt
                                    publishedAt
                                    draftedAt
                                    isMinimized
                                    minimizedReason
                                    outdated
                                    state
                                    viewerCanDelete
                                    viewerCanMinimize
                                    viewerDidAuthor
                                    replyTo { id }
                                    url
                                }
                            }
                        }
                    }
                }
            }
        }`.trim();

  try {
    const { stdout } = await execFileAsync('gh', ['api', 'graphql', '-f', `query=${query}`], {
      encoding: 'utf8',
    });

    const parsed: GraphQLResponse = JSON.parse(stdout);
    const nodes = Array.isArray(parsed?.data?.repository?.pullRequest?.reviewThreads?.nodes)
      ? parsed.data!.repository!.pullRequest!.reviewThreads!.nodes!
      : [];

    return nodes;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch review threads');
    throw error;
  }
}

function formatComment(comment: CommentNode) {
  return {
    body: comment?.body ?? '',
    author: comment?.author?.login ?? 'unknown',
    path: comment?.path ?? 'unknown',
    line: comment?.line ?? null,
  };
}

function isCommentVisible(comment: CommentNode, hideOutdated = true): boolean {
  if (!comment) return false;

  // Draft comments are not public
  // If a comment has a draftedAt timestamp but also has a publishedAt timestamp,
  // treat it as published (public). Only hide comments that are drafted and not yet published.
  if (comment.draftedAt && !comment.publishedAt) return false;

  // Minimized comments are hidden in the UI
  if (comment.isMinimized) return false;

  // Outdated comments can be hidden depending on preferences; by default hide
  if (hideOutdated && comment.outdated) return false;

  // Do not inspect comment text, minimizedReason strings, or state strings for heuristics.
  return true;
}

function threadHasVisibleComments(thread: ReviewThreadNode, hideOutdated = true): boolean {
  const comments = Array.isArray(thread?.comments?.nodes) ? thread!.comments!.nodes! : [];
  return comments.some(c => isCommentVisible(c, hideOutdated));
}

// bot author detection removed: do not exclude threads purely based on author name

export async function main(): Promise<void> {
  // CLI parsing: only accept the PR number as the single argument
  const argv = process.argv.slice(2);
  const prArg = argv[0];
  const prNumberCandidate = prArg && /^\d+$/.test(prArg) ? Number(prArg) : undefined;

  if (
    typeof prNumberCandidate !== 'number' ||
    !Number.isInteger(prNumberCandidate) ||
    prNumberCandidate <= 0
  ) {
    logger.error(
      { provided: prArg ?? process.argv[2] },
      'Invalid PR number. Usage: tsx pr-review-comments.ts <PR_NUMBER>'
    );
    process.exitCode = 2;
    return;
  }
  const prNumber: number = prNumberCandidate;
  logger.info({ owner: 'MichielDean', repo: 'ScaledTest', prNumber }, 'Fetching review threads');

  try {
    const threads = await fetchReviewThreads(prNumber);

    if (!Array.isArray(threads) || threads.length === 0) {
      logger.info({ prNumber }, 'No review threads found');
      return;
    }

    // Always hide outdated comments by default; no flags supported
    const hideOutdated = true;

    // Helper: conservative detector for whether a thread is resolved.
    // Primary signal: thread.isResolved or resolvedBy. Secondary signals: comments with
    // state/minimizedReason that explicitly indicate resolution. We keep this conservative
    // but focused: a thread is considered resolved if any clear resolved indicator exists.
    function isThreadResolved(thread: ReviewThreadNode): boolean {
      if (!thread) return false;

      // Explicit thread-level resolution flag
      if (thread.isResolved) return true;

      // If resolvedBy is set, treat as resolved
      if (thread.resolvedBy && thread.resolvedBy.login) return true;

      // Inspect comment-level hints that may indicate the thread was resolved via UI actions
      const comments = Array.isArray(thread?.comments?.nodes) ? thread!.comments!.nodes! : [];
      for (const c of comments) {
        if (!c) continue;
      }
      // Do not rely on text-based indicators inside comment fields (body/state/minimizedReason)
      // for resolution detection. Only use explicit thread-level signals (isResolved, resolvedBy).

      return false;
    }

    // Helper: return visible comments for a thread
    function getVisibleComments(thread: ReviewThreadNode, hideOutdatedFlag = hideOutdated) {
      const comments = Array.isArray(thread?.comments?.nodes) ? thread!.comments!.nodes! : [];
      return comments.filter(c => isCommentVisible(c, hideOutdatedFlag));
    }

    // Heuristic: detect bot-like author logins. Conservative patterns only.
    // bot detection heuristics intentionally omitted for now

    // Strict detector for Copilot reviewer only
    function isCopilotReviewer(login?: string | null): boolean {
      if (!login) return false;
      return String(login).toLowerCase().trim() === 'copilot-pull-request-reviewer';
    }

    // Select only unresolved threads where all visible comments are authored by Copilot reviewer
    const candidateThreads = threads.filter(t => {
      if (!t) return false;

      // Exclude threads explicitly marked resolved
      if (isThreadResolved(t)) return false;

      // Exclude collapsed threads (UI hides these by default)
      if (t.isCollapsed) return false;

      // Exclude threads that are marked outdated (UI hides outdated threads)
      if (t.isOutdated) return false;

      // Get visible comments after outdated hiding
      const visible = getVisibleComments(t, hideOutdated);
      if (visible.length === 0) return false;

      // Keep only if every visible comment is authored by the Copilot reviewer
      if (!visible.every(c => isCopilotReviewer(c?.author?.login ?? undefined))) return false;

      // ALSO ensure the entire thread contains only Copilot comments (no human replies),
      // including outdated/minimized comments. This prevents threads where a human later
      // replied (but that reply might be hidden) from being included.
      const allComments = Array.isArray(t?.comments?.nodes) ? t!.comments!.nodes! : [];
      if (!allComments.every(c => isCopilotReviewer(c?.author?.login ?? undefined))) return false;

      return true;
    });

    // Diagnostic mode: print per-thread exclusion reasons when DIAG=true
    if (process.env.DIAG === 'true') {
      for (const t of threads) {
        const id = t?.id ?? 'unknown';
        const reasons: string[] = [];
        if (isThreadResolved(t)) reasons.push('resolved');
        if (t?.isCollapsed) reasons.push('collapsed');
        if (!threadHasVisibleComments(t, hideOutdated)) reasons.push('no-visible-comments');
        if (t.isOutdated) reasons.push('outdated');

        logger.info(
          { threadId: id, reasons: reasons.length ? reasons : ['kept'] },
          'Diagnostic thread evaluation'
        );
      }
    }

    if (candidateThreads.length === 0) {
      logger.info({ prNumber }, 'No visible, unresolved review threads found');
      return;
    }
    // Optionally limit results to the most recent threads to better match the
    // GitHub UI's focus on current review activity. Default max is 10 but
    // can be adjusted via the MAX_RESULTS environment variable.
    const maxResults = Number(process.env.MAX_RESULTS || '10');

    // Sort candidate threads by the newest publishedAt among their comments
    function latestCommentDate(thread: ReviewThreadNode): number {
      const comments = Array.isArray(thread?.comments?.nodes) ? thread!.comments!.nodes! : [];
      let latest = 0;
      for (const c of comments) {
        const ts = c?.publishedAt ? Date.parse(String(c.publishedAt)) : 0;
        if (ts > latest) latest = ts;
      }
      return latest;
    }

    const sortedByDate = candidateThreads
      .slice()
      .sort((a, b) => latestCommentDate(b) - latestCommentDate(a));
    const limitedThreads = sortedByDate.slice(0, Math.max(1, Math.floor(maxResults)));

    logger.info(
      { found: candidateThreads.length, returned: limitedThreads.length, maxResults },
      'Applied result limit'
    );

    // Log summary and details for the (possibly limited) candidate threads
    const summary = limitedThreads.map(t => {
      const perThreadHideOutdated = hideOutdated;
      return {
        id: t?.id ?? 'unknown',
        isResolved: Boolean(t?.isResolved),
        isCollapsed: Boolean(t?.isCollapsed),
        isOutdated: Boolean(t?.isOutdated),
        commentCount: Array.isArray(t?.comments?.nodes) ? t!.comments!.nodes!.length : 0,
        visibleComments: Array.isArray(t?.comments?.nodes)
          ? t!.comments!.nodes!.filter(c => isCommentVisible(c, perThreadHideOutdated)).length
          : 0,
      };
    });

    logger.info({ prNumber, count: summary.length, summary }, 'Review threads summary (filtered)');

    // Full diagnostic dump of candidate thread objects when DIAG_FULL=true
    if (process.env.DIAG_FULL === 'true') {
      try {
        logger.info(
          { raw: JSON.stringify(limitedThreads, null, 2) },
          'Full candidate threads JSON'
        );
      } catch (err) {
        logger.info({ err: String(err) }, 'Failed to stringify candidate threads for DIAG_FULL');
      }
    }
    // Detailed output per thread: show visible comments only
    for (const thread of limitedThreads) {
      const threadId = thread?.id ?? 'unknown';
      const comments = Array.isArray(thread?.comments?.nodes) ? thread!.comments!.nodes! : [];
      const perThreadHideOutdated = hideOutdated;
      const visibleComments = comments.filter(c => isCommentVisible(c, perThreadHideOutdated));

      logger.info(
        { threadId, totalComments: comments.length, visibleComments: visibleComments.length },
        'Review thread (filtered)'
      );

      for (const comment of visibleComments) {
        logger.info(
          { threadId, comment: formatComment(comment), url: comment?.url ?? undefined },
          'Visible comment'
        );
      }
    }
  } catch (error) {
    logger.error({ error }, 'Unhandled error in main');
    process.exitCode = 1;
  }
}

// Run when executed directly (ESM-safe)
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  // Accept PR number as the first CLI argument
  main().catch(err => {
    logger.error({ error: err }, 'Script failed');
    process.exit(1);
  });
}
