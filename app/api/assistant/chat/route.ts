/**
 * app/api/assistant/chat/route.ts
 *
 * POST /api/assistant/chat
 *
 * Streaming AI assistant chat endpoint.
 * - Authenticates via Supabase session (teacher or admin only)
 * - Runs an agentic loop: calls DeepSeek → dispatches tool calls → repeats
 * - Streams SSE events back to the client:
 *     { type: 'tool_start',  name, call_id, args }
 *     { type: 'tool_result', name, call_id, ok, summary }
 *     { type: 'text_delta',  content }
 *     { type: 'done' }
 *     { type: 'error',       message }
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
        let iterations = 0

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
            // Stream text in small chunks for a natural feel
            const chunkSize = 8
            for (let i = 0; i < text.length; i += chunkSize) {
              send({ type: 'text_delta', content: text.slice(i, i + chunkSize) })
              // Yield to prevent blocking; not needed in Node but defensive
            }
            break
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

            // Notify client: tool starting
            send({ type: 'tool_start', name: toolName, call_id: callId, args: scopedArgs })

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

            // Notify client: tool done
            const resultData = result as any
            const summary = resultOk
              ? summariseResult(toolName, resultData)
              : `Error: ${resultData?.error ?? 'unknown'}`

            send({ type: 'tool_result', name: toolName, call_id: callId, ok: resultOk, summary })

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

    default:
      return 'Hoàn thành'
  }
}
