"use client"

import Link from "next/link"
import { ChevronLeft, MessageCircle, Mail, Phone, FileText, Bug } from "lucide-react"

const HELP_LINKS = [
  {
    icon: MessageCircle,
    label: "WhatsApp Support",
    desc: "Chat with us on WhatsApp",
    href: "https://wa.me/919999999999",
    external: true,
  },
  {
    icon: Mail,
    label: "Email Support",
    desc: "Write to us anytime",
    href: "mailto:support@billzo.app",
    external: true,
  },
  {
    icon: Phone,
    label: "Call Support",
    desc: "Speak with the team",
    href: "tel:+919999999999",
    external: true,
  },
  {
    icon: FileText,
    label: "Documentation",
    desc: "Guides & tutorials",
    href: "/docs",
    external: false,
  },
  {
    icon: Bug,
    label: "Report an Issue",
    desc: "Tell us what went wrong",
    href: "mailto:bugs@billzo.app",
    external: true,
  },
]

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Help & Support</h1>
            <p className="text-sm text-muted-foreground">Get help with BillZo</p>
          </div>
        </div>

        <div className="space-y-2">
          {HELP_LINKS.map((item, i) => (
            <a
              key={i}
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              className="flex items-center gap-4 bg-card border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                <item.icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180 shrink-0" />
            </a>
          ))}
        </div>

      </div>
    </div>
  )
}
