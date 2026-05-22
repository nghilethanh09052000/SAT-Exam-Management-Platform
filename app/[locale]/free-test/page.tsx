import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Link } from '@/i18n/navigation'
import { FreeTestSignIn } from './free-test-sign-in'

type ExamPaperRow = {
  id: string
  title: string
  source: string | null
  year: number | null
  description: string | null
  created_at: string
  exam_paper_questions: { count: number }[]
}

type AttemptRow = {
  exam_paper_id: string
  status: string
  raw_score: number | null
  total_questions: number | null
  submitted_at: string | null
}

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export default async function FreeTestPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const raw = serviceRole()

  const { data } = await raw
    .from('exam_papers')
    .select('id, title, source, year, description, created_at, exam_paper_questions(count)')
    .eq('is_public', true)
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  const papers = (data as ExamPaperRow[] | null) ?? []
  const paperIds = papers.map((paper) => paper.id)
  const { data: attemptsData } = user && paperIds.length > 0
    ? await raw
        .from('public_exam_attempts')
        .select('exam_paper_id, status, raw_score, total_questions, submitted_at')
        .eq('student_id', user.id)
        .in('exam_paper_id', paperIds)
        .order('started_at', { ascending: false })
    : { data: [] as AttemptRow[] }

  const attempts = (attemptsData as AttemptRow[] | null) ?? []
  const latestByPaper = new Map<string, AttemptRow>()
  for (const attempt of attempts) {
    if (!latestByPaper.has(attempt.exam_paper_id)) latestByPaper.set(attempt.exam_paper_id, attempt)
  }

  return (
    <main className="min-h-screen bg-[#f5f7ff] px-4 py-8 text-ink sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="overflow-hidden rounded-[32px] border border-white/80 bg-white p-7 shadow-sm md:p-9">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="success">Free SAT mock test</Badge>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-[#252837] md:text-5xl">
                Làm thử đề SAT miễn phí
              </h1>
              <p className="mt-3 max-w-2xl text-base font-semibold leading-relaxed text-[#6f778b]">
                Đăng nhập bằng Gmail để làm mock test public, xem điểm, lỗi sai, và quay lại luyện tiếp khi cần.
              </p>
            </div>
            {user ? (
              <Button variant="secondary">Streak + flashcard sẵn sàng mở rộng</Button>
            ) : (
              <FreeTestSignIn />
            )}
          </div>
        </section>

        {papers.length === 0 ? (
          <EmptyState
            title="Chưa có đề public"
            description="Khi giáo viên bật Public cho đề trong Ngân Hàng Đề Thi, đề sẽ xuất hiện ở đây."
          />
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {papers.map((paper, index) => {
              const latest = latestByPaper.get(paper.id)
              const questionCount = paper.exam_paper_questions?.reduce((sum, row) => sum + (row.count ?? 0), 0) ?? 0
              return (
                <div
                  key={paper.id}
                  className="rounded-[24px] border border-white/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f7cff] to-[#7c4dff] text-xs font-black text-white">
                      SAT
                    </div>
                    <Badge variant={latest?.status === 'submitted' ? 'success' : latest?.status === 'in_progress' ? 'warning' : 'info'}>
                      {latest?.status === 'submitted' ? 'Đã làm' : latest?.status === 'in_progress' ? 'Đang làm' : 'Public'}
                    </Badge>
                  </div>
                  <h2 className="mt-4 text-lg font-black text-[#252837]">{paper.title}</h2>
                  <p className="mt-1 text-xs font-semibold text-[#8a91a3]">
                    {[paper.source, paper.year].filter(Boolean).join(' · ') || 'Mock test'} · {questionCount} câu
                  </p>
                  {paper.description && (
                    <p className="mt-3 line-clamp-2 text-sm font-medium text-[#6f778b]">{paper.description}</p>
                  )}
                  {latest?.status === 'submitted' && latest.total_questions ? (
                    <p className="mt-4 text-sm font-black text-[#22a06b]">
                      Điểm gần nhất: {latest.raw_score ?? 0}/{latest.total_questions}
                    </p>
                  ) : null}
                  <div className="mt-5 flex gap-2">
                    {user ? (
                      <>
                        <Link href={`/free-test/test/${paper.id}`} className="flex-1">
                          <Button className="w-full">
                            {latest?.status === 'in_progress' ? 'Tiếp tục' : 'Bắt đầu'}
                          </Button>
                        </Link>
                        {latest?.status === 'submitted' && (
                          <Link href={`/free-test/test/${paper.id}/results`}>
                            <Button variant="secondary">Kết quả</Button>
                          </Link>
                        )}
                      </>
                    ) : (
                      <FreeTestSignIn />
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )}
      </div>
    </main>
  )
}
