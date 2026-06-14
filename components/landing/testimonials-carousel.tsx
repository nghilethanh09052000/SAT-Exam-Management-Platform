'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react'

export type Testimonial = {
  src: string
  score: string
  name: string
}

/**
 * Horizontal scroll-snap carousel of student score screenshots. Arrows page
 * by one card width; native touch/trackpad scroll still works, and the dots
 * track which "page" is in view.
 */
export function TestimonialsCarousel({
  items,
  badge,
}: {
  items: readonly Testimonial[]
  badge: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const [active, setActive] = useState(0)

  const update = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setAtStart(scrollLeft <= 4)
    setAtEnd(scrollLeft + clientWidth >= scrollWidth - 4)
    const card = el.querySelector<HTMLElement>('[data-card]')
    const step = card ? card.offsetWidth + 20 /* gap-5 */ : clientWidth
    setActive(Math.round(scrollLeft / step))
  }, [])

  useEffect(() => {
    update()
    const el = trackRef.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [update])

  const scrollByCards = (dir: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('[data-card]')
    const step = card ? card.offsetWidth + 20 : el.clientWidth
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  const scrollToCard = (i: number) => {
    const el = trackRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('[data-card]')
    const step = card ? card.offsetWidth + 20 : el.clientWidth
    el.scrollTo({ left: i * step, behavior: 'smooth' })
  }

  return (
    <div className="relative mt-12">
      {/* Arrows */}
      <div className="absolute -top-16 right-0 hidden gap-2 sm:flex">
        <button
          type="button"
          onClick={() => scrollByCards(-1)}
          disabled={atStart}
          aria-label="Previous"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline-light bg-white text-navy transition-colors hover:bg-navy hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-navy"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => scrollByCards(1)}
          disabled={atEnd}
          aria-label="Next"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline-light bg-white text-navy transition-colors hover:bg-navy hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-navy"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <figure
            key={item.src}
            data-card
            className="group w-[280px] shrink-0 snap-start overflow-hidden rounded-3xl border border-hairline-light bg-white shadow-[0_16px_40px_rgba(13,24,48,0.06)] sm:w-[320px] lg:w-[360px]"
          >
            <div className="relative aspect-[3/4] overflow-hidden bg-surface-soft">
              <Image
                src={item.src}
                alt={`${badge} — ${item.name} ${item.score}`}
                fill
                sizes="360px"
                className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-navy-deep/90 px-3 py-1 text-sm font-bold text-white backdrop-blur">
                <Trophy className="h-3.5 w-3.5 text-amber-300" />
                {item.score}
              </span>
            </div>
            <figcaption className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold">{item.name}</span>
              <span className="text-xs font-medium text-mute-light">{badge}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Dots */}
      <div className="mt-6 flex justify-center gap-2">
        {items.map((item, i) => (
          <button
            key={item.src}
            type="button"
            onClick={() => scrollToCard(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={[
              'h-2 rounded-full transition-all',
              i === active ? 'w-6 bg-navy' : 'w-2 bg-ash-light hover:bg-mute-light',
            ].join(' ')}
          />
        ))}
      </div>
    </div>
  )
}
