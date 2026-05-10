import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import type { User } from '@supabase/supabase-js'

/**
 * Refreshes the Supabase session on every request and returns both the
 * authenticated user and the response with updated session cookies.
 *
 * IMPORTANT: getUser() MUST be called inside this function so that any
 * token-refresh cookie writes are captured in `supabaseResponse` before
 * it is returned. Calling getUser() outside (in middleware.ts) means the
 * refreshed cookies never reach the next response.
 */
export async function updateSession(
  request: NextRequest
): Promise<{ user: User | null; response: NextResponse }> {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // 1. Write cookies onto the request so they are visible to the
          //    current handler chain.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // 2. Recreate the response so it carries the updated cookies
          //    forward to the browser and to server components.
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() is called HERE so any session refresh is written to
  // supabaseResponse before we return it.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { user, response: supabaseResponse }
}
