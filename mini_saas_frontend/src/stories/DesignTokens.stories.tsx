import type { Meta } from '@storybook/react'

const meta: Meta = {
  title: 'Design System/Tokens',
  parameters: { layout: 'fullscreen' },
}

export default meta

function Swatch({ label, color, textColor = '#fff' }: { label: string; color: string; textColor?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-14 h-14 rounded-lg border border-border shadow-sm" style={{ backgroundColor: color }} />
      <span className="text-[11px] font-mono text-muted-foreground">{label}</span>
    </div>
  )
}

export const Colors = () => {
  const semantic = [
    { label: 'Background',  var: 'hsl(var(--background))',  text: 'var(--foreground)' },
    { label: 'Foreground',  var: 'hsl(var(--foreground))',  text: '#fff' },
    { label: 'Card',        var: 'hsl(var(--card))',        text: 'var(--card-foreground)' },
    { label: 'Card Fore.',  var: 'hsl(var(--card-foreground))', text: '#fff' },
    { label: 'Primary',     var: 'hsl(var(--primary))',     text: '#fff' },
    { label: 'Primary Fore.', var: 'hsl(var(--primary-foreground))', text: '#000' },
    { label: 'Secondary',   var: 'hsl(var(--secondary))',   text: 'var(--secondary-foreground)' },
    { label: 'Destructive', var: 'hsl(var(--destructive))', text: '#fff' },
    { label: 'Success',     var: 'hsl(var(--success))',     text: '#fff' },
    { label: 'Warning',     var: 'hsl(var(--warning))',     text: '#000' },
    { label: 'Muted',       var: 'hsl(var(--muted))',       text: 'var(--muted-foreground)' },
    { label: 'Muted Fore.', var: 'hsl(var(--muted-foreground))', text: '#fff' },
    { label: 'Border',      var: 'hsl(var(--border))',      text: '#000' },
    { label: 'Ring',        var: 'hsl(var(--ring))',        text: '#fff' },
  ]

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-sm font-semibold mb-4">Semantic Colors</h2>
        <div className="flex flex-wrap gap-3">
          {semantic.map(s => (
            <div key={s.label} className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-lg border border-border shadow-sm flex items-center justify-center text-[9px] font-mono" style={{ backgroundColor: s.var, color: s.text }}>
                {s.label}
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-4">Typography Scale</h2>
        <div className="space-y-2">
          <p className="text-[28px] font-bold">Heading 1 (28px)</p>
          <p className="text-[20px] font-semibold">Heading 2 (20px)</p>
          <p className="text-base font-semibold">Heading 3 (16px)</p>
          <p className="text-sm font-medium">Body (14px)</p>
          <p className="text-xs text-muted-foreground">Caption (12px) — Muted</p>
          <p className="text-[11px] font-mono text-muted-foreground">Label (11px) — Mono Muted</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-4">Spacing &amp; Radius</h2>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="w-4 h-4 rounded bg-primary/20 flex items-center justify-center text-[8px]">4</div>
          <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center text-[9px]">6</div>
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-[10px]">8</div>
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-[10px]">10</div>
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-[10px]">12</div>
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-[10px]">16</div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-4">Shadows</h2>
        <div className="flex flex-wrap gap-6">
          {['shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-drawer'].map(s => (
            <div key={s} className={`w-24 h-16 rounded-lg bg-card border border-border flex items-center justify-center text-[10px] font-mono ${s}`}>
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
