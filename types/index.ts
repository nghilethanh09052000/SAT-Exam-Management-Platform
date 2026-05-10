/**
 * types/index.ts
 * Central export for all TypeScript types used throughout the application.
 */

// ─── DATABASE TYPES ──────────────────────────────────────────────────────────

export type { Database, Json } from './database'

// ─── ENUM TYPES ───────────────────────────────────────────────────────────────

// Import locally so they can be used in the interfaces below
import type {
  UserRole,
  QuestionType,
  QuestionDifficulty,
  SubjectType,
  ShowResultsType,
  SubmissionStatus,
  TabEventType,
  FileType,
} from './database'

export type {
  UserRole,
  QuestionType,
  QuestionDifficulty,
  SubjectType,
  ShowResultsType,
  SubmissionStatus,
  TabEventType,
  FileType,
}

// ─── TABLE ROW TYPES ─────────────────────────────────────────────────────────

export type {
  Profile,
  DeviceSession,
  Course,
  Class,
  Enrollment,
  Week,
  Tag,
  Question,
  QuestionOption,
  QuestionAcceptedAnswer,
  QuestionTag,
  Assignment,
  AssignmentQuestion,
  AssignmentInstance,
  Submission,
  SubmissionAnswer,
  ErrorLog,
  TabSwitchEvent,
  ClassLibraryFolder,
  ClassLibraryFile,
  Notification,
} from './database'

// ─── INSERT TYPES ────────────────────────────────────────────────────────────

export type {
  InsertProfile,
  InsertDeviceSession,
  InsertCourse,
  InsertClass,
  InsertEnrollment,
  InsertWeek,
  InsertTag,
  InsertQuestion,
  InsertQuestionOption,
  InsertQuestionAcceptedAnswer,
  InsertAssignment,
  InsertAssignmentQuestion,
  InsertAssignmentInstance,
  InsertSubmission,
  InsertSubmissionAnswer,
  InsertErrorLog,
  InsertTabSwitchEvent,
  InsertClassLibraryFolder,
  InsertClassLibraryFile,
  InsertNotification,
} from './database'

// ─── UPDATE TYPES ────────────────────────────────────────────────────────────

export type {
  UpdateProfile,
  UpdateCourse,
  UpdateClass,
  UpdateQuestion,
  UpdateAssignment,
  UpdateAssignmentInstance,
  UpdateSubmission,
  UpdateSubmissionAnswer,
  UpdateErrorLog,
} from './database'

// ─── APPLICATION-LEVEL TYPES ─────────────────────────────────────────────────

/**
 * API response shape used by all API routes.
 * Never throw in API routes — always return this shape.
 */
export type ApiResponse<T = null> =
  | { data: T; error: null }
  | { data: null; error: string }

/**
 * Parsed question from the .docx parser.
 */
export interface ParsedQuestion {
  type: QuestionType
  module: string
  content: string
  questionStem: string
  options: ParsedOption[]
  acceptedAnswers: string[]  // For short answer type
  imageBase64: string | null
  contentHash: string
}

export interface ParsedOption {
  label: string  // 'A' | 'B' | 'C' | 'D'
  content: string
  isCorrect: boolean
}

/**
 * Parser result shape.
 */
export interface ParseResult {
  success: boolean
  questions: ParsedQuestion[]
  errors: ParseError[]
}

export interface ParseError {
  line: number
  message: string
}

/**
 * AI tag suggestion result.
 */
export interface TagSuggestion {
  subject: SubjectType
  skillTag: string
  difficulty: QuestionDifficulty | null
}
