import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileText,
  GraduationCap,
  Grid2X2,
  Home,
  Info,
  Layers,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Smartphone,
  Trophy,
  Upload,
  UserCheck,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react'

export type AppIconName =
  | 'arrow-right'
  | 'bar-chart'
  | 'book'
  | 'calendar'
  | 'check'
  | 'chevron-right'
  | 'clipboard'
  | 'dashboard'
  | 'file'
  | 'graduation-cap'
  | 'grid'
  | 'help'
  | 'home'
  | 'info'
  | 'layers'
  | 'list'
  | 'logout'
  | 'menu'
  | 'money'
  | 'plus'
  | 'search'
  | 'settings'
  | 'smartphone'
  | 'trophy'
  | 'upload'
  | 'user-check'
  | 'users'
  | 'x'

const icons: Record<AppIconName, LucideIcon> = {
  'arrow-right': ArrowRight,
  'bar-chart': BarChart3,
  book: BookOpen,
  calendar: CalendarDays,
  check: Check,
  'chevron-right': ChevronRight,
  clipboard: ClipboardList,
  dashboard: LayoutDashboard,
  file: FileText,
  'graduation-cap': GraduationCap,
  grid: Grid2X2,
  help: CircleHelp,
  home: Home,
  info: Info,
  layers: Layers,
  list: List,
  logout: LogOut,
  menu: Menu,
  money: WalletCards,
  plus: Plus,
  search: Search,
  settings: Settings,
  smartphone: Smartphone,
  trophy: Trophy,
  upload: Upload,
  'user-check': UserCheck,
  users: Users,
  x: X,
}

export function AppIcon({
  name,
  className = 'h-5 w-5',
  strokeWidth = 2,
}: {
  name: AppIconName
  className?: string
  strokeWidth?: number
}) {
  const Icon = icons[name]
  return <Icon aria-hidden="true" className={className} strokeWidth={strokeWidth} />
}
