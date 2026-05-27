#!/usr/bin/env node
/**
 * mcp/src/index.ts
 *
 * SAT Platform MCP Server
 * =======================
 * Exposes the SAT Exam Management Platform to any MCP client (Claude Code,
 * Claude Desktop, Cursor, etc.) via stdio transport.
 *
 * Tool groups:
 *   📚 Questions    — list, get, search, create
 *   📝 Assignments  — list, get, create, add question, submission stats
 *   👥 Students     — list, get, class roster, courses
 *   📊 Submissions  — list, get, student progress, class leaderboard
 *   🤖 AI           — classify subject, suggest tags, generate explanation
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... node dist/index.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createAdminClient } from './supabase.js'

// ── Question tools ──────────────────────────────────────────────────────────
import {
  ListQuestionsInput,  listQuestions,
  GetQuestionInput,    getQuestion,
  SearchQuestionsInput, searchQuestions,
  CreateQuestionInput, createQuestion,
} from './tools/questions.js'

// ── Assignment tools ────────────────────────────────────────────────────────
import {
  ListAssignmentsInput,  listAssignments,
  GetAssignmentInput,    getAssignment,
  CreateAssignmentInput, createAssignment,
  AddQuestionInput,      addQuestionToAssignment,
  GetSubmissionStatsInput, getSubmissionStats,
} from './tools/assignments.js'

// ── Student / Class tools ───────────────────────────────────────────────────
import {
  ListStudentsInput,     listStudents,
  GetStudentInput,       getStudent,
  ListClassesInput,      listClasses,
  GetClassRosterInput,   getClassRoster,
  ListCoursesInput,      listCourses,
} from './tools/students.js'

// ── Submission tools ────────────────────────────────────────────────────────
import {
  ListSubmissionsInput,     listSubmissions,
  GetSubmissionInput,       getSubmission,
  GetStudentProgressInput,  getStudentProgress,
  GetClassLeaderboardInput, getClassLeaderboard,
} from './tools/submissions.js'

// ── AI tools ────────────────────────────────────────────────────────────────
import {
  ClassifySubjectInput,     classifySubject,
  SuggestTagsInput,         suggestTags,
  GenerateExplanationInput, generateExplanation,
} from './tools/ai.js'

// ─── Server setup ────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'sat-platform',
  version: '0.1.0',
})

const db = createAdminClient()

// ─── 📚 Question tools ───────────────────────────────────────────────────────

server.registerTool(
  'list_questions',
  {
    description: 'List questions from the SAT question bank with optional filters. Returns paginated results with content preview and tags.',
    inputSchema: ListQuestionsInput,
  },
  async (input) => {
    const result = await listQuestions(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'get_question',
  {
    description: 'Get full details of a single question including content, options, accepted answers, and tags.',
    inputSchema: GetQuestionInput,
  },
  async (input) => {
    const result = await getQuestion(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'search_questions',
  {
    description: 'Full-text search questions by content or tag names. Best for finding questions by topic or keyword.',
    inputSchema: SearchQuestionsInput,
  },
  async (input) => {
    const result = await searchQuestions(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'create_question',
  {
    description: 'Create a new question in the SAT question bank. Supports multiple_choice and short_answer types.',
    inputSchema: CreateQuestionInput,
  },
  async (input) => {
    const result = await createQuestion(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

// ─── 📝 Assignment tools ─────────────────────────────────────────────────────

server.registerTool(
  'list_assignments',
  {
    description: 'List assignments. Optionally filter by teacher UUID.',
    inputSchema: ListAssignmentsInput,
  },
  async (input) => {
    const result = await listAssignments(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'get_assignment',
  {
    description: 'Get an assignment with its full list of questions, order, and point values.',
    inputSchema: GetAssignmentInput,
  },
  async (input) => {
    const result = await getAssignment(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'create_assignment',
  {
    description: 'Create a new empty assignment for a teacher. Use add_question_to_assignment to populate it.',
    inputSchema: CreateAssignmentInput,
  },
  async (input) => {
    const result = await createAssignment(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'add_question_to_assignment',
  {
    description: 'Link an existing question to an assignment. Automatically sets display order.',
    inputSchema: AddQuestionInput,
  },
  async (input) => {
    const result = await addQuestionToAssignment(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'get_submission_stats',
  {
    description: 'Get aggregate submission stats for an assignment — average score, completion rate, time spent. Optionally narrow to one instance.',
    inputSchema: GetSubmissionStatsInput,
  },
  async (input) => {
    const result = await getSubmissionStats(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

// ─── 👥 Student & Class tools ────────────────────────────────────────────────

server.registerTool(
  'list_students',
  {
    description: 'List all student profiles. Optionally filter by approval status or search by name/email.',
    inputSchema: ListStudentsInput,
  },
  async (input) => {
    const result = await listStudents(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'get_student',
  {
    description: 'Get a student\'s full profile including class enrollments and course info.',
    inputSchema: GetStudentInput,
  },
  async (input) => {
    const result = await getStudent(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'list_classes',
  {
    description: 'List all active classes. Optionally filter by course UUID.',
    inputSchema: ListClassesInput,
  },
  async (input) => {
    const result = await listClasses(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'get_class_roster',
  {
    description: 'Get all students enrolled in a specific class, with their profiles.',
    inputSchema: GetClassRosterInput,
  },
  async (input) => {
    const result = await getClassRoster(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'list_courses',
  {
    description: 'List all active courses. Optionally filter by teacher UUID.',
    inputSchema: ListCoursesInput,
  },
  async (input) => {
    const result = await listCourses(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

// ─── 📊 Submission tools ─────────────────────────────────────────────────────

server.registerTool(
  'list_submissions',
  {
    description: 'List submissions filtered by assignment instance, student, or status.',
    inputSchema: ListSubmissionsInput,
  },
  async (input) => {
    const result = await listSubmissions(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'get_submission',
  {
    description: 'Get a submission\'s details. Set include_answers=true to see per-question responses and correctness.',
    inputSchema: GetSubmissionInput,
  },
  async (input) => {
    const result = await getSubmission(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'get_student_progress',
  {
    description: 'Get a student\'s submission history with scores, progress trend, and time analytics.',
    inputSchema: GetStudentProgressInput,
  },
  async (input) => {
    const result = await getStudentProgress(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'get_class_leaderboard',
  {
    description: 'Get top-N ranked scores for a class on a specific assignment instance.',
    inputSchema: GetClassLeaderboardInput,
  },
  async (input) => {
    const result = await getClassLeaderboard(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

// ─── 🤖 AI tools ─────────────────────────────────────────────────────────────

server.registerTool(
  'classify_question_subject',
  {
    description: 'Use AI to classify a question as "math" or "reading_writing". Falls back to rule-based when ANTHROPIC_API_KEY is not set.',
    inputSchema: ClassifySubjectInput,
  },
  async (input) => {
    const result = await classifySubject(input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'suggest_question_tags',
  {
    description: 'Use AI to suggest subject, skill tag, and difficulty for a question. Requires ANTHROPIC_API_KEY.',
    inputSchema: SuggestTagsInput,
  },
  async (input) => {
    const result = await suggestTags(input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.registerTool(
  'generate_explanation',
  {
    description: 'Generate a student-friendly AI explanation for a question. Optionally saves the explanation back to the DB when question_id is provided.',
    inputSchema: GenerateExplanationInput,
  },
  async (input) => {
    const result = await generateExplanation(db, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[sat-platform-mcp] Server running on stdio')
}

main().catch((err) => {
  console.error('[sat-platform-mcp] Fatal error:', err)
  process.exit(1)
})
