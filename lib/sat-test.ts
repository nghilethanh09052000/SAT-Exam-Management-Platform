export const SAT_READING_WRITING_MODULE_SECONDS = 32 * 60
export const SAT_MATH_MODULE_SECONDS = 35 * 60
export const SAT_SECTION_BREAK_SECONDS = 10 * 60

export type SatModuleSubject = 'reading-writing' | 'math'

export function getSatModuleSubject(moduleName: string | null | undefined): SatModuleSubject | null {
  const normalized = (moduleName ?? '').toLowerCase()
  if (normalized.includes('math')) return 'math'
  if (
    normalized.includes('reading') ||
    normalized.includes('writing') ||
    normalized.includes('english') ||
    normalized.includes('reading_writing') ||
    /\brw\b/.test(normalized)
  ) {
    return 'reading-writing'
  }
  return null
}

export function getSatModuleDurationSeconds(moduleName: string | null | undefined): number | null {
  const subject = getSatModuleSubject(moduleName)
  if (subject === 'reading-writing') return SAT_READING_WRITING_MODULE_SECONDS
  if (subject === 'math') return SAT_MATH_MODULE_SECONDS
  return null
}

function getModuleNumber(moduleName: string | null | undefined): number {
  const match = (moduleName ?? '').match(/module\s*(\d+)/i)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

function getSubjectRank(moduleName: string | null | undefined): number {
  const subject = getSatModuleSubject(moduleName)
  if (subject === 'reading-writing') return 0
  if (subject === 'math') return 1
  return 2
}

export function compareSatModules(a: string | null | undefined, b: string | null | undefined): number {
  const subjectDiff = getSubjectRank(a) - getSubjectRank(b)
  if (subjectDiff !== 0) return subjectDiff

  const moduleDiff = getModuleNumber(a) - getModuleNumber(b)
  if (moduleDiff !== 0) return moduleDiff

  return (a ?? '').localeCompare(b ?? '')
}
