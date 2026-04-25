'use client'

interface SheetProps {
  children: React.ReactNode
  onClose: () => void
  title?: string
}

export function Sheet({ children, onClose, title }: SheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div 
        onClick={onClose} 
        className="absolute inset-0 bg-black/35" 
      />
      <div className="relative bg-white rounded-t-2xl px-5 pb-8 pt-3 max-h-[92%] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        {title && (
          <h2 className="text-xl font-bold text-center mb-5">{title}</h2>
        )}
        {children}
      </div>
    </div>
  )
}

export function Badge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    PAID: { bg: '#DCFCE7', color: '#16A34A' },
    UNPAID: { bg: '#FEE2E2', color: '#DC2626' },
    PENDING: { bg: '#FEF3C7', color: '#D97706' },
    FAILED: { bg: '#FEF3C7', color: '#D97706' },
    REVIEW: { bg: '#FEF3C7', color: '#D97706' },
  }
  const s = map[status] || map.PENDING
  
  return (
    <span 
      style={{ background: s.bg, color: s.color }}
      className="px-2 py-0.5 rounded-full text-xs font-bold tracking-wide"
    >
      {status}
    </span>
  )
}

export function Input({ 
  label, 
  optional, 
  prefix, 
  placeholder, 
  value, 
  onChange,
  type = 'text'
}: { 
  label?: string
  optional?: boolean
  prefix?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <div className="mb-4">
      {label && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold tracking-widest uppercase text-gray-500">{label}</span>
          {optional && <span className="text-xs text-gray-400">Optional</span>}
        </div>
      )}
      <div className={`flex items-center border-2 rounded-xl overflow-hidden ${value ? 'border-blue-600' : 'border-gray-200'}`}>
        {prefix && (
          <span className="px-3 border-r border-gray-200 text-gray-500 font-semibold">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 border-none outline-none px-4 py-3 text-base bg-transparent"
        />
      </div>
    </div>
  )
}

export function Button({ 
  children, 
  onClick, 
  color = '#1B6BF5', 
  outline,
  style = {}
}: { 
  children: React.ReactNode
  onClick?: () => void
  color?: string
  outline?: boolean
  style?: React.CSSProperties
}) {
  return (
    <button 
      onClick={onClick}
      style={{
        background: outline ? '#fff' : color,
        color: outline ? color : '#fff',
        border: outline ? `2px solid ${color}` : 'none',
        ...style
      }}
      className="w-full py-4 rounded-xl font-bold text-base cursor-pointer"
    >
      {children}
    </button>
  )
}