'use client'

import { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { getDateRangeOptions, type DateRange } from './useReportsData'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

export function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const options = getDateRangeOptions()

  const selectedLabel = options.find(o =>
    o.range.start === value.start && o.range.end === value.end
  )?.label || 'Custom'

  const handleSelect = (val: string) => {
    const opt = options.find(o => o.value === val)
    if (!opt) return
    if (val === 'custom') {
      setShowCustom(true)
    } else {
      setShowCustom(false)
      onChange(opt.range)
      setOpen(false)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 transition-colors"
      >
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span>{selectedLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 w-52 rounded-2xl border bg-white shadow-xl p-2 space-y-1">
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  selectedLabel === opt.label
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-slate-100'
                }`}
              >
                {opt.label}
                {opt.value !== 'custom' && (
                  <span className="block text-[10px] opacity-60 mt-0.5">
                    {opt.range.start} — {opt.range.end}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {showCustom && (
        <div className="mt-2 p-3 border rounded-xl bg-white shadow-sm space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">Start Date</label>
          <input
            type="date"
            value={value.start}
            onChange={e => onChange({ ...value, start: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <label className="text-xs font-semibold text-muted-foreground">End Date</label>
          <input
            type="date"
            value={value.end}
            onChange={e => onChange({ ...value, end: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  )
}