export function getMaxAttempts(maxRetakes: number) {
  return Math.max(1, maxRetakes + 1)
}

export function canCreateAttempt(attemptCount: number, maxRetakes: number) {
  return attemptCount < getMaxAttempts(maxRetakes)
}

export function canRevealReview(showResults: 'immediately' | 'after_deadline', deadline: string, now = new Date()) {
  return showResults === 'immediately' || new Date(deadline).getTime() <= now.getTime()
}
