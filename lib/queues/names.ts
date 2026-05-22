export const QUEUE_TOPICS = {
  smokeTest: 'worker-smoke-test',
  questionImport: 'question-import',
  studentImport: 'student-import',
} as const

export const QUEUE_CONSUMER_GROUPS = {
  smokeTest: 'sat-platform-worker-smoke-test',
  questionImport: 'sat-platform-question-import',
  studentImport: 'sat-platform-student-import',
} as const
