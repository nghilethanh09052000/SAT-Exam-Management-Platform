import { AppIcon, type AppIconName } from '@/components/ui/app-icon'
import type { NavItem } from '@/components/ui/sidebar'

type T = (key: string) => string

function navIcon(name: AppIconName, className = 'h-4 w-4') {
  return <AppIcon name={name} className={className} />
}

export function adminNavItems(t: T): NavItem[] {
  return [
    {
      label: t('overview'),
      href: '/admin',
      icon: navIcon('home'),
    },
    {
      label: t('analytics'),
      href: '/teacher/analytics',
      icon: navIcon('bar-chart'),
    },
    {
      label: t('students'),
      href: '/admin/students',
      icon: navIcon('users'),
    },
    {
      label: t('permissions'),
      href: '/admin/users',
      icon: navIcon('user-check'),
    },
    {
      label: t('deviceMonitor'),
      href: '/admin/device-sessions',
      icon: navIcon('smartphone'),
    },
    {
      label: t('courses'),
      href: '/admin/courses',
      icon: navIcon('book'),
    },
    {
      label: t('learningResources'),
      icon: navIcon('layers'),
      children: [
        {
          label: t('assignments'),
          href: '/teacher/assignments',
          icon: navIcon('clipboard'),
        },
        {
          label: t('examBank'),
          href: '/teacher/exam-papers',
          icon: navIcon('file'),
        },
        {
          label: t('uploads'),
          href: '/admin/imports',
          icon: navIcon('upload'),
        },
        {
          label: t('questionBank'),
          href: '/teacher/questions',
          icon: navIcon('help'),
        },
      ],
    },
  ]
}

export function teacherNavItems(t: T): NavItem[] {
  return [
    {
      label: t('overview'),
      href: '/teacher',
      icon: navIcon('dashboard'),
    },
    {
      label: t('analytics'),
      href: '/teacher/analytics',
      icon: navIcon('bar-chart'),
    },
    {
      label: t('students'),
      href: '/teacher/students',
      icon: navIcon('users'),
    },
    {
      label: t('courses'),
      href: '/teacher/courses',
      icon: navIcon('book'),
    },
    {
      label: t('learningResources'),
      icon: navIcon('layers'),
      children: [
        {
          label: t('assignments'),
          href: '/teacher/assignments',
          icon: navIcon('clipboard'),
        },
        {
          label: t('examBank'),
          href: '/teacher/exam-papers',
          icon: navIcon('file'),
        },
        {
          label: t('questionBank'),
          href: '/teacher/questions',
          icon: navIcon('help'),
        },
      ],
    },
    {
      label: t('settings'),
      href: '/teacher/settings',
      icon: navIcon('settings'),
    },
  ]
}
