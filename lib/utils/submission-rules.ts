export function getMaxAttempts(maxRetakes: number) {
  return Math.max(1, maxRetakes + 1)
}

export function canCreateAttempt(attemptCount: number, maxRetakes: number) {
  return attemptCount < getMaxAttempts(maxRetakes)
}

export function canRevealReview(showResults: 'immediately' | 'after_deadline', deadline: string, now = new Date()) {
  return showResults === 'immediately' || new Date(deadline).getTime() <= now.getTime()
}

// ─── Granular visibility policies (client feedback 2026-06) ──────────────────

export type ScoreVisibilityPolicy =
  | 'on_submit'
  | 'on_partial'
  | 'after_all_students'
  | 'after_deadline'

export type AnswerVisibilityPolicy = ScoreVisibilityPolicy | 'after_score_threshold'

export interface VisibilityContext {
  /** Class-wide deadline (not per-student extension — reveals are class-wide). */
  deadline: string
  /** Every enrolled student in the class has at least one submitted attempt. */
  allStudentsSubmitted: boolean
  /** Student's best score as a percentage (0-100), null when nothing graded. */
  scorePct: number | null
  now?: Date
}

export function canSeeScore(policy: ScoreVisibilityPolicy, ctx: VisibilityContext): boolean {
  const now = ctx.now ?? new Date()
  switch (policy) {
    case 'on_submit':
    case 'on_partial':
      // The results page only renders submitted attempts, so both behave
      // identically here; on_partial additionally lets the in-test UI show
      // partial scores when leaving early.
      return true
    case 'after_all_students':
      return ctx.allStudentsSubmitted || new Date(ctx.deadline).getTime() <= now.getTime()
    case 'after_deadline':
      return new Date(ctx.deadline).getTime() <= now.getTime()
  }
}

export function canSeeAnswers(
  policy: AnswerVisibilityPolicy,
  threshold: number | null,
  ctx: VisibilityContext
): boolean {
  if (policy === 'after_score_threshold') {
    return ctx.scorePct !== null && ctx.scorePct >= (threshold ?? 0)
  }
  return canSeeScore(policy, ctx)
}
