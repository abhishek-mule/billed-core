"use client"

import { cn } from "@/lib/utils"

const concepts = [
  {
    name: "Arrow Shield",
    tagline: "Recovery + Protection",
    svg: (
      <svg viewBox="0 0 100 100" className="w-24 h-24">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1E3A8A" />
            <stop offset="100%" stopColor="#312E81" />
          </linearGradient>
        </defs>
        <path
          d="M50 10 L85 30 L85 55 C85 75 70 88 50 95 C30 88 15 75 15 55 L15 30 Z"
          fill="url(#g1)"
          opacity="0.15"
        />
        <path
          d="M50 10 L85 30 L85 55 C85 75 70 88 50 95 C30 88 15 75 15 55 L15 30 Z"
          fill="none"
          stroke="url(#g1)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M30 55 L45 68 L70 38"
          fill="none"
          stroke="#059669"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    colors: ["#1E3A8A", "#059669", "#312E81"],
  },
  {
    name: "Rupee Circuit",
    tagline: "AI-Powered Finance",
    svg: (
      <svg viewBox="0 0 100 100" className="w-24 h-24">
        <defs>
          <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#312E81" />
            <stop offset="100%" stopColor="#0D9488" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="38" fill="none" stroke="url(#g2)" strokeWidth="2" opacity="0.3" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="url(#g2)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.15" />
        <circle cx="50" cy="50" r="28" fill="none" stroke="url(#g2)" strokeWidth="2" opacity="0.2" />
        <text x="50" y="58" textAnchor="middle" fontSize="36" fontWeight="bold" fill="url(#g2)" fontFamily="system-ui">₹</text>
        <circle cx="72" cy="28" r="3" fill="#F59E0B" opacity="0.8" />
        <circle cx="82" cy="45" r="2.5" fill="#F59E0B" opacity="0.6" />
        <circle cx="28" cy="72" r="2.5" fill="#F59E0B" opacity="0.6" />
        <circle cx="45" cy="82" r="2" fill="#F59E0B" opacity="0.4" />
      </svg>
    ),
    colors: ["#312E81", "#0D9488", "#F59E0B"],
  },
  {
    name: "Chat Check",
    tagline: "WhatsApp-First Recovery",
    svg: (
      <svg viewBox="0 0 100 100" className="w-24 h-24">
        <defs>
          <linearGradient id="g3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0D9488" />
            <stop offset="100%" stopColor="#0891B2" />
          </linearGradient>
        </defs>
        <path
          d="M15 35 C15 22 22 15 35 15 L65 15 C78 15 85 22 85 35 L85 60 C85 73 78 80 65 80 L50 80 L35 92 L35 80 L35 80 C22 80 15 73 15 60 Z"
          fill="url(#g3)"
          opacity="0.12"
          stroke="url(#g3)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M32 50 L45 63 L70 38"
          fill="none"
          stroke="#F97316"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    colors: ["#0D9488", "#0891B2", "#F97316"],
  },
  {
    name: "Flow B",
    tagline: "Abstract Modern Minimal",
    svg: (
      <svg viewBox="0 0 100 100" className="w-24 h-24">
        <defs>
          <linearGradient id="g4" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0891B2" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
        </defs>
        <path
          d="M30 20 C30 20 50 20 55 35 C60 50 50 55 45 55 C40 55 35 52 35 45"
          fill="none"
          stroke="url(#g4)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M35 45 C35 45 40 55 50 60 C60 65 68 60 70 52 C74 38 62 30 50 30"
          fill="none"
          stroke="url(#g4)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.6"
        />
        <circle cx="50" cy="75" r="4" fill="#22C55E" opacity="0.8" />
        <path
          d="M30 20 L30 80"
          fill="none"
          stroke="url(#g4)"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    ),
    colors: ["#0891B2", "#6366F1", "#22C55E"],
  },
  {
    name: "Invoice → Coin",
    tagline: "Document to Recovery",
    svg: (
      <svg viewBox="0 0 100 100" className="w-24 h-24">
        <defs>
          <linearGradient id="g5" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1E3A8A" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <rect x="18" y="15" width="32" height="42" rx="3" fill="none" stroke="#1E3A8A" strokeWidth="2.5" />
        <line x1="24" y1="25" x2="44" y2="25" stroke="#1E3A8A" strokeWidth="1.5" opacity="0.5" />
        <line x1="24" y1="32" x2="40" y2="32" stroke="#1E3A8A" strokeWidth="1.5" opacity="0.5" />
        <line x1="24" y1="39" x2="38" y2="39" stroke="#1E3A8A" strokeWidth="1.5" opacity="0.5" />
        <line x1="24" y1="46" x2="30" y2="46" stroke="#1E3A8A" strokeWidth="1.5" opacity="0.5" />
        <path
          d="M55 45 C55 35 65 28 75 28 C85 28 92 35 92 45 C92 55 85 62 75 62 C65 62 55 55 55 45 Z"
          fill="none"
          stroke="#059669"
          strokeWidth="2.5"
        />
        <text x="75" y="50" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#059669" fontFamily="system-ui">₹</text>
        <path d="M50 36 L55 40" stroke="#1E3A8A" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <path d="M52 42 L58 46" stroke="#059669" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      </svg>
    ),
    colors: ["#1E3A8A", "#059669", "#6366F1"],
  },
]

const palettes = [
  { name: "Trust Fintech", colors: ["#1E3A8A", "#059669", "#F59E0B"], desc: "Classic fintech blue + green + warm accent" },
  { name: "Modern Indian", colors: ["#312E81", "#0D9488", "#F97316"], desc: "Premium indigo + teal + coral" },
  { name: "Fresh Energy", colors: ["#0891B2", "#6366F1", "#22C55E"], desc: "Youthful cyan + indigo + green" },
]

export default function LogoExplorer() {
  return (
    <div className="min-h-screen bg-muted/50 pb-12">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6 lg:py-10 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-foreground">BillZo Logo Concepts</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Exploring visual directions for AI Recovery OS for Indian MSMEs
          </p>
        </div>

        {/* Concepts Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {concepts.map((c) => (
            <div
              key={c.name}
              className="bg-card border border-border rounded-lg p-5 flex flex-col items-center text-center gap-3 hover:border-primary/40 transition-colors"
            >
              <div className="w-28 h-28 flex items-center justify-center rounded-xl bg-muted/30 p-2">
                {c.svg}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.tagline}</p>
              </div>
              <div className="flex gap-1.5">
                {c.colors.map((color) => (
                  <div
                    key={color}
                    className="w-4 h-4 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Color Palettes */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Color Palette Options</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {palettes.map((p) => (
              <div
                key={p.name}
                className="bg-card border border-border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  {p.colors.map((color) => (
                    <div
                      key={color}
                      className="flex-1 h-8 rounded-md"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.desc}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.colors.map((color) => (
                    <code
                      key={color}
                      className="text-[10px] px-1.5 py-0.5 bg-muted rounded font-mono text-muted-foreground"
                    >
                      {color}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Wordmark Experiments */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Wordmark Experiments</h2>
          <div className="bg-card border border-border rounded-lg p-5 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#1E3A8A] to-[#312E81] flex items-center justify-center text-white text-sm font-bold">
                B
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight text-foreground" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
                  BillZo
                </p>
                <p className="text-[10px] text-muted-foreground tracking-widest uppercase">Recovery OS</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0D9488] to-[#0891B2] flex items-center justify-center text-white text-sm font-bold">
                B
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight text-foreground" style={{ fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
                  BillZo
                </p>
                <p className="text-[10px] text-muted-foreground tracking-widest uppercase">Recovery OS</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0891B2] to-[#6366F1] flex items-center justify-center text-white text-sm font-bold">
                B
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight text-foreground" style={{ fontFamily: "system-ui, sans-serif" }}>
                  billzo
                </p>
                <p className="text-[10px] text-muted-foreground tracking-widest uppercase">recovery os</p>
              </div>
            </div>
          </div>
        </div>

        {/* Usage */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">Usage Notes</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>• All SVGs scale cleanly from 32px favicon to 512px app icon</li>
            <li>• Dark mode variants invert or lighten the backgrounds</li>
            <li>• Gradient fills should have solid-color fallbacks for email/clients</li>
            <li>• Minimum clear space: 25% of icon width on all sides</li>
            <li>• Icon + wordmark lockup preferred for app header; icon-only for favicon/mobile</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
