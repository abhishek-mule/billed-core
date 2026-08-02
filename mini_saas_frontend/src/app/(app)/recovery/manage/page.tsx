"use client"

import { DeprecatedRoute } from "@/components/billzo/DeprecatedRoute"

export default function ManagePage() {
  return <DeprecatedRoute redirect="/recovery/queue" message="/recovery/manage is deprecated — use /recovery/queue" />
}
