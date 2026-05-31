/**
 * app/api/assistant/chat/route.ts
 *
 * POST /api/assistant/chat
 *
 * Streaming AI assistant chat endpoint.
 * SSE events emitted to client:
 *     { type: 'text_delta',      content }
 *     { type: 'action_proposal', title, steps }   ← confirm card
 *     { type: 'done' }
 *     { type: 'error',           message }
 */

import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { withTeacher } from '@/lib/with-auth'
import { buildSystemPrompt } from '@/lib/assistant/system-prompt'
import { getToolsForRole, MAX_TOOL_ITERATIONS } from '@/lib/assistant/tools/registry'
import { HANDLERS } from '@/lib/assistant/tools/handlers'
import { scopeArgs } from '@/lib/assistant/scope'
import { logToolCall } from '@/lib/assistant/audit'
import { serviceClient } from '@/lib/supabase/service'

// ── DeepSeek client ──────────────────────────────────────────────────────────

function getDeepSeek() {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('DEEPSEEK_API_KEY is not configured')
  return new OpenAI({
    apiKey:  key,
    baseURL: process.env.DEEPSEEK_API_BASE_URL ?? 'https://api.deepseek.com',
  })
}

// ── SSE helpers ──────────────────────────────────────────────────────────────

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

// ── Route handler ────────────────────────────────────────────────────────────

export const POST = withTeacher(async (req, { user, profile, db: _db }) => {
  const db = serviceClient()

  // Parse body
  let body: { messages?: unknown[]; contextClassId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { messages: rawMessages = [], contextClassId } = body

  // Validate messages are an array
  if (!Array.isArray(rawMessages)) {
    return NextResponse.json({ error: 'messages must be an array' }, { status: 400 })
  }

  const role = profile.role as 'teacher' | 'admin'

  // Optionally fetch class name for context
  let contextClassName: string | undefined
  if (contextClassId) {
    const { data: cls } = await db
      .from('classes')
      .select('title')
      .eq('id', contextClassId)
      .single()
    contextClassName = (cls as any)?.title
  }

  // Fetch actor name for system prompt
  const { data: actorProfile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
  const actorName = (actorProfile as any)?.full_name ?? undefined

  const systemPrompt = buildSystemPrompt({ role, actorName, contextClassName })
  const tools = getToolsForRole(role)

  // Initialise message history
  type Msg = OpenAI.Chat.ChatCompletionMessageParam
  const messages: Msg[] = rawMessages as Msg[]

  // ── Create SSE ReadableStream ──────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (event: unknown) => {
        try { controller.enqueue(enc.encode(sseEvent(event))) } catch { /* client disconnected */ }
      }

      try {
        const deepseek = getDeepSeek()
        let iterations    = 0
        let proposalSent  = false   // tracks if propose_action was called this session
        const isConfirmed = (rawMessages as any[]).some(
          (m: any) => typeof m.content === 'string' && m.content.startsWith('[XÁC NHẬN]')
        )

        // Write tools that must go through the proposal flow
        const WRITE_TOOLS = new Set([
          'create_course', 'create_class', 'enroll_students', 'setup_mock_test',
          'create_assignment', 'create_question',
        ])

        // Agentic loop
        while (iterations < MAX_TOOL_ITERATIONS) {
          iterations++

          const response = await deepseek.chat.completions.create({
            model:       process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
            max_tokens:  4096,
            messages:    [{ role: 'system', content: systemPrompt }, ...messages],
            tools,
            tool_choice: 'auto',
            stream:      false,
          })

          const choice = response.choices[0]
          if (!choice) break

          const msg = choice.message

          // Add assistant message to history
          messages.push(msg)

          // If no tool calls → stream final text response
          if (!msg.tool_calls || msg.tool_calls.length === 0) {
            const text = msg.content ?? ''
            const chunkSize = 8
            for (let i = 0; i < text.length; i += chunkSize) {
              send({ type: 'text_delta', content: text.slice(i, i + chunkSize) })
            }
            break
          }

          // ── Auto-intercept: if AI calls write tools without propose_action ─
          // and the user hasn't already confirmed, auto-build a proposal card.
          const writeCallsThisTurn = msg.tool_calls.filter(
            tc => WRITE_TOOLS.has(tc.function.name)
          )
          const hasProposalCall = msg.tool_calls.some(tc => tc.function.name === 'propose_action')

          if (writeCallsThisTurn.length > 0 && !hasProposalCall && !proposalSent && !isConfirmed) {
            // Build proposal from the write tool calls the AI tried to make
            const autoSteps = writeCallsThisTurn.map((tc, idx) => {
              let args: Record<string, any> = {}
              try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
              const scoped = scopeArgs(role, user.id, tc.function.name, args)
              return {
                step:        idx + 1,
                tool:        tc.function.name,
                description: buildAutoDescription(tc.function.name, scoped),
                args:        scoped,
              }
            })

            const autoTitle = buildAutoTitle(writeCallsThisTurn.map(tc => tc.function.name))
            send({ type: 'action_proposal', title: autoTitle, steps: autoSteps })
            proposalSent = true

            // Return pending to all write tool calls so the AI asks for confirmation
            for (const tc of msg.tool_calls) {
              messages.push({
                role:         'tool',
                tool_call_id: tc.id,
                content:      JSON.stringify({
                  status:  'pending_confirmation',
                  message: 'Đã hiển thị kế hoạch cho người dùng. Hãy hỏi họ xác nhận.',
                }),
              })
            }
            continue
          }

          // Execute each tool call
          for (const toolCall of msg.tool_calls) {
            const toolName = toolCall.function.name
            const callId   = toolCall.id

            let parsedArgs: Record<string, any>
            try {
              parsedArgs = JSON.parse(toolCall.function.arguments || '{}')
            } catch {
              parsedArgs = {}
            }

            // Inject scope (teacher can't escape their own data)
            const scopedArgs = scopeArgs(role, user.id, toolName, parsedArgs)

            // ── Special: propose_action → emit confirm card ──────────────────
            if (toolName === 'propose_action') {
              const { title = 'Kế hoạch thực hiện', steps = [] } = scopedArgs as any
              send({ type: 'action_proposal', title, steps })
              proposalSent = true

              messages.push({
                role:         'tool',
                tool_call_id: callId,
                content:      JSON.stringify({
                  status:  'pending_confirmation',
                  message: 'Đã hiển thị kế hoạch cho người dùng. Hãy hỏi họ xác nhận.',
                }),
              })
              continue
            }

            // Execute handler
            let result: unknown
            let resultOk = true

            const handler = HANDLERS[toolName]
            if (!handler) {
              result   = { error: `Unknown tool: ${toolName}` }
              resultOk = false
            } else {
              try {
                result = await handler(db, scopedArgs)
                resultOk = !(result as any)?.error
              } catch (err) {
                result   = { error: err instanceof Error ? err.message : 'Tool execution failed' }
                resultOk = false
              }
            }

            // Audit log (fire-and-forget)
            logToolCall({
              actorId:  user.id,
              role,
              toolName,
              args:     scopedArgs,
              resultOk,
            })

            // Add tool result to message history for next loop iteration
            messages.push({
              role:         'tool',
              tool_call_id: callId,
              content:      JSON.stringify(result),
            })
          }

          // Continue loop to get final response
        }

        send({ type: 'done' })
      } catch (err) {
        send({
          type:    'error',
          message: err instanceof Error ? err.message : 'An unexpected error occurred',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection:      'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering on Vercel
    },
  })
})

// ── Result summariser (for tool_result chip) ─────────────────────────────────

function summariseResult(toolName: string, result: any): string {
  if (!result || result.error) return `Error: ${result?.error ?? 'unknown'}`

  const d = result.data

  switch (toolName) {
    case 'get_class_summary':
      return `Lớp "${d?.class?.title}" — ${d?.enrolment_count} học sinh, điểm TB ${d?.avg_score_pct ?? 'N/A'}%, hoàn thành ${d?.completion_rate_pct ?? 'N/A'}%`

    case 'get_weak_students':
      return `${d?.weak_students?.length ?? 0} học sinh yếu (ngưỡng < ${d?.threshold_pct}%)`

    case 'list_classes':
      return `${(d ?? []).length} lớp học`

    case 'get_class_roster':
      return `${d?.total ?? 0} học sinh trong lớp "${d?.class?.title}"`

    case 'list_students':
      return `${(d ?? []).length} học sinh`

    case 'get_student':
      return `Học sinh: ${d?.profile?.full_name ?? 'N/A'}`

    case 'get_student_progress':
      return `${d?.summary?.total_submissions ?? 0} lần nộp, điểm TB ${d?.summary?.avg_score_pct ?? 'N/A'}%`

    case 'get_class_leaderboard':
      return `Top ${(d ?? []).length} học sinh`

    case 'list_assignments':
      return `${(d ?? []).length} bài tập`

    case 'get_submission_stats':
      return `${d?.submission_count ?? 0} bài nộp, điểm TB ${d?.stats?.avg_score_pct ?? 'N/A'}%`

    case 'search_questions':
      return `${(d ?? []).length} câu hỏi tìm được`

    case 'list_questions':
      return `${(d ?? []).length} câu hỏi`

    case 'get_question':
      return `Câu hỏi: ${d?.content_preview?.slice(0, 60) ?? 'N/A'}…`

    case 'list_courses':
      return `${(d ?? []).length} khóa học`

    case 'create_course':
      return `✅ Đã tạo khóa học "${d?.title}" (ID: ${d?.id?.slice(0,8)}…)`

    case 'create_class':
      return `✅ Đã tạo lớp "${d?.title}" (ID: ${d?.id?.slice(0,8)}…)`

    case 'enroll_students':
      return `✅ Đã thêm ${d?.enrolled ?? 0} học sinh${d?.not_found_emails?.length ? ` — không tìm thấy: ${d.not_found_emails.join(', ')}` : ''}`

    case 'setup_mock_test':
      return `✅ Đã tạo & đăng "${d?.assignment_title}" — ${d?.question_count} câu, hạn nộp ${d?.deadline ? new Date(d.deadline).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A'}`

    default:
      return 'Hoàn thành'
  }
}

// ── Auto-proposal helpers ─────────────────────────────────────────────────────

function buildAutoDescription(toolName: string, args: Record<string, any>): string {
  switch (toolName) {
    case 'create_course':
      return `Tạo khóa học "${args.title ?? ''}"`
    case 'create_class':
      return `Tạo lớp "${args.title ?? ''}"${args.schedule_text ? ` — ${args.schedule_text}` : ''}`
    case 'enroll_students':
      return `Thêm ${(args.emails ?? []).length} học sinh vào lớp`
    case 'setup_mock_test':
      return `Tạo bài kiểm tra "${args.title ?? ''}" — ${(args.question_ids ?? []).length} câu`
    case 'create_assignment':
      return `Tạo bài tập "${args.title ?? ''}"`
    case 'create_question':
      return `Tạo câu hỏi mới`
    default:
      return toolName
  }
}

function buildAutoTitle(toolNames: string[]): string {
  const ops = Array.from(new Set(toolNames))
  if (ops.includes('create_course') && ops.includes('create_class')) return 'Tạo khóa học + lớp học'
  if (ops.includes('create_course')) return 'Tạo khóa học mới'
  if (ops.includes('create_class')) return `Tạo ${toolNames.length > 1 ? toolNames.length + ' ' : ''}lớp học mới`
  if (ops.includes('setup_mock_test')) return 'Tạo bài kiểm tra thử'
  if (ops.includes('enroll_students')) return 'Thêm học sinh vào lớp'
  return 'Thực hiện thao tác'
}
