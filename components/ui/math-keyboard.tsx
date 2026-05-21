'use client'

import { useState, useCallback } from 'react'

type Tab = '123' | '∞≠∈' | 'abc' | 'αβγ'

interface KeyDef {
  label: string
  insert: string
  wide?: boolean
  isDelete?: boolean
}

const KEYS: Record<Tab, KeyDef[][]> = {
  '123': [
    [
      { label: 'y', insert: 'y' },
      { label: 'a', insert: 'a' },
      { label: '7', insert: '7' },
      { label: '8', insert: '8' },
      { label: '9', insert: '9' },
      { label: '¹⁄□', insert: '\\frac{}{}' },
      { label: 'ln', insert: 'ln' },
      { label: 'i', insert: 'i' },
      { label: 'sin', insert: 'sin' },
    ],
    [
      { label: '≤', insert: '≤' },
      { label: '≥', insert: '≥' },
      { label: '4', insert: '4' },
      { label: '5', insert: '5' },
      { label: '6', insert: '6' },
      { label: '×', insert: '×' },
      { label: "′", insert: "′" },
      { label: '□²', insert: '^{2}' },
      { label: '√□', insert: '\\sqrt{}' },
    ],
    [
      { label: '[', insert: '[' },
      { label: ']', insert: ']' },
      { label: '1', insert: '1' },
      { label: '2', insert: '2' },
      { label: '3', insert: '3' },
      { label: '±', insert: '±' },
      { label: '∫', insert: '∫' },
      { label: '∃', insert: '∃' },
      { label: '⌫', insert: '', isDelete: true },
    ],
    [
      { label: '√(□/□)', insert: '\\sqrt{\\frac{}{}}', wide: true },
      { label: '∞', insert: '∞' },
      { label: ',', insert: ',' },
      { label: '≠', insert: '≠' },
      { label: 'Σ', insert: 'Σ' },
      { label: '«', insert: '«' },
      { label: '»', insert: '»' },
    ],
  ],
  '∞≠∈': [
    [
      { label: '∞', insert: '∞' },
      { label: '≠', insert: '≠' },
      { label: '∈', insert: '∈' },
      { label: '∉', insert: '∉' },
      { label: '⊂', insert: '⊂' },
      { label: '⊃', insert: '⊃' },
      { label: '∪', insert: '∪' },
      { label: '∩', insert: '∩' },
      { label: '∅', insert: '∅' },
    ],
    [
      { label: '≈', insert: '≈' },
      { label: '≡', insert: '≡' },
      { label: '≤', insert: '≤' },
      { label: '≥', insert: '≥' },
      { label: '≪', insert: '≪' },
      { label: '≫', insert: '≫' },
      { label: '∝', insert: '∝' },
      { label: '∼', insert: '∼' },
      { label: '⌫', insert: '', isDelete: true },
    ],
    [
      { label: '∀', insert: '∀' },
      { label: '∃', insert: '∃' },
      { label: '∄', insert: '∄' },
      { label: '∴', insert: '∴' },
      { label: '∵', insert: '∵' },
      { label: '√□', insert: '\\sqrt{}' },
      { label: '√(□/□)', insert: '\\sqrt{\\frac{}{}}', wide: true },
    ],
    [
      { label: '±', insert: '±' },
      { label: '∓', insert: '∓' },
      { label: '×', insert: '×' },
      { label: '÷', insert: '÷' },
      { label: '·', insert: '·' },
      { label: '∫', insert: '∫' },
      { label: 'Σ', insert: 'Σ' },
      { label: 'Π', insert: 'Π' },
    ],
  ],
  abc: [
    [
      { label: 'a', insert: 'a' },
      { label: 'b', insert: 'b' },
      { label: 'c', insert: 'c' },
      { label: 'd', insert: 'd' },
      { label: 'e', insert: 'e' },
      { label: 'f', insert: 'f' },
      { label: 'g', insert: 'g' },
      { label: 'h', insert: 'h' },
      { label: 'i', insert: 'i' },
    ],
    [
      { label: 'j', insert: 'j' },
      { label: 'k', insert: 'k' },
      { label: 'l', insert: 'l' },
      { label: 'm', insert: 'm' },
      { label: 'n', insert: 'n' },
      { label: 'o', insert: 'o' },
      { label: 'p', insert: 'p' },
      { label: 'q', insert: 'q' },
      { label: 'r', insert: 'r' },
    ],
    [
      { label: 's', insert: 's' },
      { label: 't', insert: 't' },
      { label: 'u', insert: 'u' },
      { label: 'v', insert: 'v' },
      { label: 'w', insert: 'w' },
      { label: 'x', insert: 'x' },
      { label: 'y', insert: 'y' },
      { label: 'z', insert: 'z' },
      { label: '⌫', insert: '', isDelete: true },
    ],
    [
      { label: 'sin', insert: 'sin' },
      { label: 'cos', insert: 'cos' },
      { label: 'tan', insert: 'tan' },
      { label: 'ln', insert: 'ln' },
      { label: 'log', insert: 'log' },
      { label: 'lim', insert: 'lim' },
      { label: 'max', insert: 'max' },
      { label: 'min', insert: 'min' },
    ],
  ],
  αβγ: [
    [
      { label: 'α', insert: 'α' },
      { label: 'β', insert: 'β' },
      { label: 'γ', insert: 'γ' },
      { label: 'δ', insert: 'δ' },
      { label: 'ε', insert: 'ε' },
      { label: 'ζ', insert: 'ζ' },
      { label: 'η', insert: 'η' },
      { label: 'θ', insert: 'θ' },
      { label: 'ι', insert: 'ι' },
    ],
    [
      { label: 'κ', insert: 'κ' },
      { label: 'λ', insert: 'λ' },
      { label: 'μ', insert: 'μ' },
      { label: 'ν', insert: 'ν' },
      { label: 'ξ', insert: 'ξ' },
      { label: 'π', insert: 'π' },
      { label: 'ρ', insert: 'ρ' },
      { label: 'σ', insert: 'σ' },
      { label: 'τ', insert: 'τ' },
    ],
    [
      { label: 'υ', insert: 'υ' },
      { label: 'φ', insert: 'φ' },
      { label: 'χ', insert: 'χ' },
      { label: 'ψ', insert: 'ψ' },
      { label: 'ω', insert: 'ω' },
      { label: 'Δ', insert: 'Δ' },
      { label: 'Λ', insert: 'Λ' },
      { label: 'Θ', insert: 'Θ' },
      { label: '⌫', insert: '', isDelete: true },
    ],
    [
      { label: 'Φ', insert: 'Φ' },
      { label: 'Ψ', insert: 'Ψ' },
      { label: 'Ω', insert: 'Ω' },
      { label: 'Γ', insert: 'Γ' },
      { label: 'Σ', insert: 'Σ' },
      { label: 'Π', insert: 'Π' },
      { label: 'Ξ', insert: 'Ξ' },
      { label: '∞', insert: '∞' },
    ],
  ],
}

const TABS: Tab[] = ['123', '∞≠∈', 'abc', 'αβγ']

interface MathKeyboardProps {
  onInsert: (text: string) => void
  onDelete: () => void
  onClose: () => void
}

export function MathKeyboard({ onInsert, onDelete, onClose }: MathKeyboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('123')

  const handleKey = useCallback((key: KeyDef) => {
    if (key.isDelete) {
      onDelete()
    } else {
      onInsert(key.insert)
    }
  }, [onInsert, onDelete])

  const rows = KEYS[activeTab]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] border-t border-slate-200 bg-[#d1d5db] shadow-2xl">
      {/* Tab bar */}
      <div className="flex items-center justify-between bg-[#adb5bd] px-2 pt-1">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setActiveTab(tab) }}
              className={[
                'rounded-t-[6px] px-4 py-1.5 text-sm font-semibold transition-colors',
                activeTab === tab
                  ? 'bg-[#d1d5db] text-slate-800'
                  : 'bg-[#8d96a0] text-white hover:bg-[#a0a8b0]',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onClose() }}
          className="mb-1 flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-300"
          aria-label="Close keyboard"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
          </svg>
        </button>
      </div>

      {/* Keys */}
      <div className="space-y-1.5 p-2 pb-3">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-1.5">
            {row.map((key, keyIndex) => (
              <button
                key={keyIndex}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleKey(key) }}
                className={[
                  'flex flex-1 items-center justify-center rounded-[8px] py-3.5 text-[15px] font-medium shadow-[0_1px_0_rgba(0,0,0,0.35)] transition-all active:translate-y-0.5 active:shadow-none',
                  key.isDelete
                    ? 'bg-[#adb5bd] text-slate-700 hover:bg-[#9ba4ac]'
                    : key.insert === '\\sqrt{\\frac{}{}}' || key.wide
                    ? 'bg-[#3b82f6] text-white hover:bg-[#2563eb]'
                    : 'bg-white text-slate-800 hover:bg-slate-50',
                  key.wide ? 'flex-[2]' : '',
                ].join(' ')}
                title={key.label}
              >
                {key.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function useMathKeyboard() {
  const [showKeyboard, setShowKeyboard] = useState(false)

  const openKeyboard = useCallback(() => setShowKeyboard(true), [])
  const closeKeyboard = useCallback(() => setShowKeyboard(false), [])

  return { showKeyboard, openKeyboard, closeKeyboard }
}
