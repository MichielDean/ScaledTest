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

// Try to detect the actual Copilot reviewer login by inspecting existing PR reviews.
// This helps when GitHub presents the actor with a suffix like `[bot]` or other
// variations. Returns the first matching login or null if none found.
async function findCopilotReviewerLogin(prNumber: number): Promise<string | null> {
  try {
    const owner = 'MichielDean';
    const repo = 'ScaledTest';
    const endpoint = `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`;
    const { stdout } = await execFileAsync('gh', ['api', endpoint], { encoding: 'utf8' });
    const reviews = JSON.parse(stdout as string);
    if (!Array.isArray(reviews)) return null;

    for (const r of reviews) {
      const login = r?.user?.login;
      if (!login) continue;
      const norm = String(login).toLowerCase();
      if (norm.includes('copilot')) return login;
    }

    return null;
  } catch (err) {
    logger.info({ err: String(err), prNumber }, 'Failed to detect copilot reviewer login');
    return null;
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

async function resolveThreadGraphQL(threadId: string): Promise<boolean> {
  if (!threadId) return false;

  const mutation = `
    mutation {
  resolveReviewThread(input: { threadId: "${threadId}" }) {
        thread { id isResolved }
      }
    }`.trim();

  try {
    const { stdout } = await execFileAsync('gh', ['api', 'graphql', '-f', `query=${mutation}`], {
      encoding: 'utf8',
    });
    const parsed = JSON.parse(stdout as string);
    const resolved = Boolean(parsed?.data?.resolveReviewThread?.thread?.isResolved);
    return resolved;
  } catch (error) {
    logger.error({ error, threadId }, 'Failed to resolve review thread via GraphQL');
    throw error;
  }
}

// Strict: only request a review for the explicit reviewer login provided. Do not
// fall back to alternative usernames. If reviewerLogin is not provided or null,
// this function will refuse to act and return false.
async function requestCopilotReview(
  prNumber: number,
  reviewerLogin: string | null
): Promise<boolean> {
  if (!reviewerLogin) {
    logger.error(
      { prNumber },
      'No detected Copilot reviewer login provided; refusing to request review (no fallback)'
    );
    return false;
  }
  // Normalize copilot-like variants to the canonical 'Copilot' login used by the
  // REST API when requesting an app reviewer.
  const normalized = normalizeCopilotLogin(reviewerLogin) ?? reviewerLogin;

  try {
    const collaborator = await isCollaborator(normalized);
    if (!collaborator) {
      logger.info(
        { prNumber, reviewerLogin: normalized },
        'Detected Copilot reviewer is not a repository collaborator; will attempt request anyway'
      );
    }
  } catch (err) {
    logger.info(
      { err, prNumber, reviewerLogin: normalized },
      'Failed to verify collaborator status for detected Copilot reviewer; will attempt request'
    );
  }

  try {
    const owner = 'MichielDean';
    const repo = 'ScaledTest';
    const endpoint = `/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`;
    const args = ['api', endpoint, '--method', 'POST', '-f', `reviewers[]=${normalized}`];
    await execFileAsync('gh', args, { encoding: 'utf8' });
    return true;
  } catch (error) {
    logger.error(
      { error, prNumber, reviewerLogin: normalized },
      'Failed to request Copilot review via REST API'
    );
    process.exitCode = 1;
    return false;
  }
}

// Check whether a given login is a collaborator for the repository.
async function isCollaborator(login: string): Promise<boolean> {
  if (!login) return false;
  try {
    const owner = 'MichielDean';
    const repo = 'ScaledTest';
    const endpoint = `/repos/${owner}/${repo}/collaborators/${encodeURIComponent(login)}`;
    // gh api will exit non-zero for 404; resolve true only when call succeeds
    await execFileAsync('gh', ['api', endpoint], { encoding: 'utf8' });
    return true;
  } catch (err) {
    logger.info(
      { err: String(err), login },
      'Collaborator check failed or user is not a collaborator'
    );
    return false;
  }
}

// If the PR currently has exactly one requested reviewer and that reviewer
// appears to be the Copilot actor (app or bot), return that exact login so we
// re-request the same identity. Otherwise return null.
async function getRequestedCopilotReviewer(prNumber: number): Promise<string | null> {
  try {
    const owner = 'MichielDean';
    const repo = 'ScaledTest';
    const endpoint = `/repos/${owner}/${repo}/pulls/${prNumber}`;
    const { stdout } = await execFileAsync('gh', ['api', endpoint], { encoding: 'utf8' });
    const pr = JSON.parse(stdout as string);
    const requested = Array.isArray(pr?.requested_reviewers) ? pr.requested_reviewers : [];
    if (requested.length !== 1) return null;
    const login = requested[0]?.login;
    if (!login) return null;
    const normalized = String(login).toLowerCase();
    if (normalized.includes('copilot')) return login;
    return null;
  } catch (err) {
    logger.info({ err, prNumber }, 'Failed to read requested_reviewers from PR');
    return null;
  }
}

async function waitForNewVisibleComment(
  prNumber: number,
  timeoutSeconds = 180,
  pollIntervalSeconds = 5
): Promise<boolean> {
  const start = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  // Snapshot current visible candidate count
  const initialThreads = await fetchReviewThreads(prNumber);
  const initialCandidateCount = Array.isArray(initialThreads) ? initialThreads.length : 0;

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, pollIntervalSeconds * 1000));
    try {
      const threads = await fetchReviewThreads(prNumber);
      const candidateThreads = Array.isArray(threads) ? threads : [];

      // Count visible/unresolved/copilot-only candidate threads using same heuristics as main
      const newCandidates = candidateThreads.filter(t => {
        if (!t) return false;
        if (isThreadResolved(t)) return false;
        if (t.isCollapsed) return false;
        if (t.isOutdated) return false;
        const visible = Array.isArray(t?.comments?.nodes)
          ? t!.comments!.nodes!.filter(c => isCommentVisible(c))
          : [];
        if (visible.length === 0) return false;
        if (!visible.every(c => isCopilotReviewer(c?.author?.login ?? undefined))) return false;
        const allComments = Array.isArray(t?.comments?.nodes) ? t!.comments!.nodes! : [];
        if (!allComments.every(c => isCopilotReviewer(c?.author?.login ?? undefined))) return false;
        return true;
      });

      if (newCandidates.length > initialCandidateCount) return true;
    } catch (err) {
      logger.info({ err: String(err) }, 'Polling: fetch failed, retrying');
    }
  }

  return false;
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

  return false;
}

// Helper: return visible comments for a thread
function getVisibleComments(thread: ReviewThreadNode, hideOutdatedFlag = true) {
  const comments = Array.isArray(thread?.comments?.nodes) ? thread!.comments!.nodes! : [];
  return comments.filter(c => isCommentVisible(c, hideOutdatedFlag));
}

// Strict detector for Copilot reviewer only
// Detected reviewer login (populated at runtime by inspecting PR reviews) when available.
let detectedCopilotLogin: string | null = null;

function isCopilotReviewer(login?: string | null): boolean {
  if (!login) return false;
  const normalized = String(login).toLowerCase().trim();
  if (detectedCopilotLogin) {
    return normalized === String(detectedCopilotLogin).toLowerCase().trim();
  }

  // Fallbacks: accept common Copilot actor variants when detection isn't available.
  if (normalized === 'copilot-pull-request-reviewer') return true;
  if (normalized === 'copilot-pull-request-reviewer[bot]') return true;
  // A permissive fallback if the login contains copilot and reviewer-like tokens.
  if (normalized.includes('copilot') && normalized.includes('review')) return true;
  return false;
}

// Normalize various Copilot actor login variants to the canonical login used
// when requesting reviewers. GitHub often exposes both a bot-like login
// (copilot-pull-request-reviewer[bot]) and the app login (Copilot). Use the
// canonical 'Copilot' when we detect a Copilot-like identity so the REST API
// receives a stable identifier.
function normalizeCopilotLogin(login?: string | null): string | null {
  if (!login) return null;
  const s = String(login).trim();
  if (s.toLowerCase().includes('copilot')) return 'Copilot';
  return s;
}

// bot author detection removed: do not exclude threads purely based on author name

export async function main(): Promise<void> {
  // CLI parsing: only accept the PR number as the single argument
  const argv = process.argv.slice(2);

  // Support optional flags: --resolve or -r to resolve the selected comment's thread
  const resolveFlagIndex = argv.findIndex(a => a === '--resolve' || a === '-r');
  const shouldResolve = resolveFlagIndex !== -1;
  if (shouldResolve) argv.splice(resolveFlagIndex, 1);

  // Support optional flag: --request-review or -R to re-request a Copilot review for the PR
  const requestFlagIndex = argv.findIndex(a => a === '--request-review' || a === '-R');
  const shouldRequestReview = requestFlagIndex !== -1;
  if (shouldRequestReview) argv.splice(requestFlagIndex, 1);

  // Support optional flag: --poll or -P to wait for Copilot to post a new review comment
  const pollFlagIndex = argv.findIndex(a => a === '--poll' || a === '-P');
  const shouldPoll = pollFlagIndex !== -1;
  if (shouldPoll) argv.splice(pollFlagIndex, 1);

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
    // Try to detect the actual Copilot reviewer login for accurate matching and
    // for use when requesting a reviewer via the REST API.
    // Prefer the PR's currently requested reviewer (if it's a single Copilot actor)
    const requestedLogin = await getRequestedCopilotReviewer(prNumber);
    detectedCopilotLogin = requestedLogin ?? (await findCopilotReviewerLogin(prNumber));

    if (shouldPoll) {
      logger.info({ prNumber }, 'Polling for new visible Copilot comment');
      const found = await waitForNewVisibleComment(prNumber);
      if (!found) {
        logger.info({ prNumber }, 'Polling ended without new visible Copilot comment');
        return;
      }
    }

    const threads = await fetchReviewThreads(prNumber);

    if (!Array.isArray(threads) || threads.length === 0) {
      logger.info({ prNumber }, 'No review threads found');
      return;
    }

    // Always hide outdated comments by default; no flags supported
    const hideOutdated = true;

    // Use top-level helpers: isThreadResolved, getVisibleComments, isCopilotReviewer
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

    // Collect all visible comments across candidate threads
    const visibleCommentsWithContext: Array<{
      threadId: string;
      comment: CommentNode;
      publishedAtTs: number;
    }> = [];

    for (const t of candidateThreads) {
      const threadId = t?.id ?? 'unknown';
      const comments = Array.isArray(t?.comments?.nodes) ? t!.comments!.nodes! : [];
      for (const c of comments) {
        if (!isCommentVisible(c, hideOutdated)) continue;
        const ts = c?.publishedAt ? Date.parse(String(c.publishedAt)) : 0;
        visibleCommentsWithContext.push({ threadId, comment: c!, publishedAtTs: ts });
      }
    }

    if (visibleCommentsWithContext.length === 0) {
      logger.info({ prNumber }, 'No visible comments found in candidate threads');
      return;
    }

    // Sort by publishedAt (newest first) and pick a single comment to return
    visibleCommentsWithContext.sort((a, b) => b.publishedAtTs - a.publishedAtTs);
    const selected = visibleCommentsWithContext[0];

    logger.info(
      {
        prNumber,
        threadId: selected.threadId,
        comment: formatComment(selected.comment),
        url: selected.comment?.url ?? undefined,
      },
      'Selected single review comment'
    );

    // Full diagnostic dump when DIAG_FULL=true
    if (process.env.DIAG_FULL === 'true') {
      try {
        logger.info({ raw: JSON.stringify(selected, null, 2) }, 'Selected comment JSON');
      } catch (err) {
        logger.info({ err: String(err) }, 'Failed to stringify selected comment for DIAG_FULL');
      }
    }

    // If requested, attempt to resolve the thread for the selected comment
    if (shouldResolve) {
      try {
        logger.info(
          { prNumber, threadId: selected.threadId },
          'Attempting to resolve selected thread'
        );
        const ok = await resolveThreadGraphQL(selected.threadId);
        if (ok) {
          logger.info({ threadId: selected.threadId }, 'Thread resolved successfully');
          process.exitCode = 0;
        } else {
          logger.error({ threadId: selected.threadId }, 'GraphQL returned unresolved state');
          process.exitCode = 2;
        }
      } catch (err) {
        logger.error({ error: err, threadId: selected.threadId }, 'Failed to resolve thread');
        process.exitCode = 1;
      }
    }

    // If requested, attempt to request a Copilot review for the PR
    if (shouldRequestReview) {
      try {
        logger.info({ prNumber }, 'Requesting Copilot review for PR');
        const ok = await requestCopilotReview(prNumber, detectedCopilotLogin);
        if (ok) logger.info({ prNumber }, 'Requested Copilot review successfully');
        else logger.error({ prNumber }, 'Failed to request Copilot review (no success response)');
      } catch (err) {
        logger.error({ error: err, prNumber }, 'Error while requesting Copilot review');
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
