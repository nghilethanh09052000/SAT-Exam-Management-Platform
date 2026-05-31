/**
 * lib/assistant/audit.ts
 *
 * Logs every assistant tool call to the assistant_audit table.
 * Fire-and-forget — never throws, never blocks the response.
 */

import { serviceClient } from '@/lib/supabase/service'

export async function logToolCall(opts: {
  actorId: string
  role: string
  toolName: string
  args: unknown
  resultOk: boolean
}): Promise<void> {
  try {
    await (serviceClient() as any).from('assistant_audit').insert({
      actor_id:  opts.actorId,
      role:      opts.role,
      tool_name: opts.toolName,
      args:      opts.args as any,
      result_ok: opts.resultOk,
    })
  } catch {
    // Audit failure must never surface to the user
  }
}
