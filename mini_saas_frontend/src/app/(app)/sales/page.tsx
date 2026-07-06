"use client"

import Link from "next/link"
import {
  CreditCard,
  FileText,
  Receipt,
  ShoppingCart,
} from "lucide-react"

const SALES_ACTIONS = [
  {
    href: "/pos",
    title: "POS",
    description: "Create a bill quickly while selling.",
    icon: ShoppingCart,
    primary: true,
  },
  {
    href: "/invoices",
    title: "Invoices",
    description: "See bills, share them, and receive payment.",
    icon: Receipt,
    primary: false,
  },
  {
    href: "/invoices?status=draft",
    title: "Drafts",
    description: "Continue bills that are not ready yet.",
    icon: FileText,
    primary: false,
  },
  {
    href: "/invoices",
    title: "Payment Links",
    description: "Create and share links from invoices.",
    icon: CreditCard,
    primary: false,
  },
]

export default function SalesPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-sm text-muted-foreground mt-1">What have you sold?</p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold">Create money</h2>
            <p className="text-xs text-muted-foreground mt-1">Start with a bill, then share it or collect payment.</p>
          </div>
          <Link
            href="/pos"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/95"
          >
            Create Invoice
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {SALES_ACTIONS.map(({ href, title, description, icon: Icon, primary }) => (
          <Link
            key={title}
            href={href}
            className={`rounded-xl border p-5 no-underline transition-colors ${
              primary
                ? "border-primary/20 bg-primary/10 hover:bg-primary/15"
                : "border-border bg-card hover:bg-secondary"
            }`}
          >
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
              primary ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              <Icon size={18} />
            </span>
            <h3 className="mt-4 text-base font-extrabold text-foreground">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </Link>
        ))}
      </section>
    </div>
  )
}
