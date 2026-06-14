'use client'

import { createContext, useContext, useMemo } from 'react'
import type { Permission } from '@/lib/permissions'

/**
 * Client-side permission context for cosmetic gating (hide/disable controls a staff
 * member can't use). The server is still the real gate — these checks only improve UX so
 * users don't click buttons that would 403.
 *
 * Fed from the teacher/admin layout, which reads the user's permissions from the
 * gd_role_cache cookie. Admin → `can()` is always true (god mode).
 */

type PermissionsContextValue = {
  isAdmin: boolean
  permissions: ReadonlySet<Permission>
}

const PermissionsContext = createContext<PermissionsContextValue>({
  isAdmin: false,
  permissions: new Set<Permission>(),
})

export function PermissionsProvider({
  isAdmin,
  permissions,
  children,
}: {
  isAdmin: boolean
  permissions: string[]
  children: React.ReactNode
}) {
  const value = useMemo<PermissionsContextValue>(
    () => ({ isAdmin, permissions: new Set(permissions as Permission[]) }),
    [isAdmin, permissions]
  )
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissions() {
  const { isAdmin, permissions } = useContext(PermissionsContext)
  return {
    isAdmin,
    /** True if the current user holds `perm` (admin always does). */
    can: (perm: Permission) => isAdmin || permissions.has(perm),
  }
}
