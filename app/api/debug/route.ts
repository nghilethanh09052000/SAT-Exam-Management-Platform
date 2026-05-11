import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return NextResponse.json({ 
    user: user ? { id: user.id, email: user.email } : null,
    error: error?.message ?? null,
    timestamp: new Date().toISOString()
  })
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  let body: unknown
  try { body = await req.json() } catch { body = null }
  
  return NextResponse.json({ 
    user: user ? { id: user.id, email: user.email } : null,
    authError: authError?.message ?? null,
    body,
    timestamp: new Date().toISOString()
  })
}
