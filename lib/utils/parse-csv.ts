/**
 * Shared CSV parser for student import.
 * Used by both admin/students and teacher class-detail pages.
 */

export interface ParsedStudentRow {
  full_name:    string
  email:        string
  phone:        string
  birth_year:   number | null
  gender:       string
  school:       string
  city:         string
  facebook_url: string
  threads_url:  string
  hobbies:      string
  target_score: number | null
  source:       string
  /** Client-side validation error — rows with errors are skipped on import */
  error?:       string
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

/** Header aliases — case-insensitive substring match */
const COL_ALIASES: Record<string, string[]> = {
  full_name:    ['họ tên', 'ho ten', 'tên', 'ten', 'full_name', 'name', 'họ và tên'],
  email:        ['email', 'e-mail', 'địa chỉ email', 'dia chi email'],
  phone:        ['điện thoại', 'dien thoai', 'sdt', 'số điện thoại', 'so dien thoai', 'phone', 'tel'],
  birth_year:   ['năm sinh', 'nam sinh', 'birth_year', 'year', 'năm'],
  gender:       ['giới tính', 'gioi tinh', 'gender', 'gt'],
  school:       ['trường học', 'truong hoc', 'trường', 'truong', 'school'],
  city:         ['tỉnh', 'tinh', 'thành phố', 'thanh pho', 'city', 'province', 'tỉnh/thành'],
  facebook_url: ['facebook', 'fb', 'facebook_url'],
  threads_url:  ['threads', 'thread', 'threads_url'],
  hobbies:      ['sở thích', 'so thich', 'hobbies', 'hobby', 'thích'],
  target_score: ['mục tiêu', 'muc tieu', 'target_score', 'target', 'điểm mục tiêu', 'diem muc tieu'],
  source:       ['nguồn', 'nguon', 'source', 'biết đến', 'biet den', 'nguồn biết đến'],
}

function buildColMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    const idx = headers.findIndex((h) =>
      aliases.some((a) => h.toLowerCase().trim().includes(a))
    )
    if (idx >= 0) map[field] = idx
  }
  return map
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const TEMPLATE_HEADERS = [
  'Họ tên', 'Email', 'Số điện thoại', 'Năm sinh', 'Giới tính',
  'Trường học', 'Tỉnh/Thành phố', 'Facebook', 'Threads',
  'Sở thích', 'Mục tiêu điểm SAT', 'Nguồn biết đến',
]

export const PREVIEW_COLS: { key: keyof ParsedStudentRow; label: string }[] = [
  { key: 'full_name',    label: 'Họ tên'        },
  { key: 'email',        label: 'Email'          },
  { key: 'phone',        label: 'SĐT'            },
  { key: 'birth_year',   label: 'Năm sinh'       },
  { key: 'gender',       label: 'Giới tính'      },
  { key: 'school',       label: 'Trường học'     },
  { key: 'city',         label: 'Tỉnh/TP'        },
  { key: 'facebook_url', label: 'Facebook'       },
  { key: 'threads_url',  label: 'Threads'        },
  { key: 'hobbies',      label: 'Sở thích'       },
  { key: 'target_score', label: 'Mục tiêu SAT'   },
  { key: 'source',       label: 'Nguồn biết đến' },
]

export function downloadStudentTemplate() {
  const rows = [
    TEMPLATE_HEADERS,
    [
      'Nguyễn Văn An', 'an.nguyen@gmail.com', '0901234567', '2007', 'Nam',
      'THPT Nguyễn Du', 'TP. Hồ Chí Minh', 'https://facebook.com/an.nguyen', '',
      'Bóng đá, âm nhạc', '1400', 'Bạn bè giới thiệu',
    ],
    [
      'Trần Thị Bình', 'binh.tran@gmail.com', '0912345678', '2008', 'Nữ',
      'THPT Lê Quý Đôn', 'Hà Nội', '', 'https://threads.net/@binh.tran',
      'Đọc sách, vẽ', '1350', 'Mạng xã hội',
    ],
  ]
  const escape = (v: string) => v.includes(',') ? `"${v}"` : v
  const csv = rows.map((r) => r.map(escape).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'mau-danh-sach-hoc-sinh.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function parseStudentCSV(file: File): Promise<ParsedStudentRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Không thể đọc file.'))
    reader.onload = (e) => {
      try {
        const text = (e.target!.result as string)
          .replace(/^﻿/, '')    // strip BOM
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')

        const lines = text.split('\n').filter((l) => l.trim() !== '')
        if (lines.length < 2) { resolve([]); return }

        const headers = parseCSVLine(lines[0])
        const cm = buildColMap(headers)

        // Positional fallbacks for required fields if no header match
        const nameIdx  = cm.full_name  ?? 0
        const emailIdx = cm.email      ?? 1
        const phoneIdx = cm.phone      ?? 2

        const rows: ParsedStudentRow[] = []

        for (let i = 1; i < lines.length; i++) {
          const f = parseCSVLine(lines[i])
          const g = (idx: number | undefined) =>
            (idx !== undefined ? (f[idx] ?? '') : '').trim()

          const full_name    = g(nameIdx)
          const email        = g(emailIdx).toLowerCase()
          const phone        = g(phoneIdx)
          const birth_year_s = g(cm.birth_year)
          const gender       = g(cm.gender)
          const school       = g(cm.school)
          const city         = g(cm.city)
          const facebook_url = g(cm.facebook_url)
          const threads_url  = g(cm.threads_url)
          const hobbies      = g(cm.hobbies)
          const target_s     = g(cm.target_score)
          const source       = g(cm.source)

          if (!full_name && !email) continue

          const birth_year   = birth_year_s ? parseInt(birth_year_s, 10)  || null : null
          const target_score = target_s     ? parseInt(target_s, 10)       || null : null

          let error: string | undefined
          if (!full_name)                               error = 'Thiếu họ tên'
          else if (!email)                              error = 'Thiếu email'
          else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Email không hợp lệ'

          rows.push({
            full_name, email, phone,
            birth_year, gender, school, city,
            facebook_url, threads_url, hobbies,
            target_score, source,
            error,
          })
        }

        resolve(rows)
      } catch {
        reject(new Error('File CSV không hợp lệ.'))
      }
    }
    reader.readAsText(file, 'UTF-8')
  })
}
