"use client"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { formatCurrency } from "@/lib/format"
import { ActionDTO } from "@/types/dto"

export function ActionCard({ action }: { action: ActionDTO }) {
  const queryClient = useQueryClient()
  const [showPreview, setShowPreview] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/invoices/${action.invoiceId}/remind`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("Failed to send reminder")
      return res.json()
    },
    onSuccess: () => {
      setSuccessMsg(
        `Good move. You pushed ${formatCurrency(action.amountPaise)} closer to recovery.`
      )
      queryClient.invalidateQueries({ queryKey: ["dashboard-actions"] })
    },
  })

  if (mutation.isError) {
    return (
      <div className="rounded-2xl border border-red-200 p-6 text-center text-red-700">
        <p className="font-semibold">Failed to send. Please try again.</p>
        <button onClick={() => mutation.reset()} className="mt-2 text-sm underline">Reset</button>
      </div>
    )
  }

  if (successMsg) {
    return (
      <div className="rounded-2xl border p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-green-700">{successMsg}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-blue-500 p-6 shadow-md transition-all">
      <div className="mb-4">
        <p className="text-xl font-semibold">
          {action.customerName} owes {formatCurrency(action.amountPaise)}
        </p>
        <p className="text-sm text-gray-500">
          {action.confidence > 0.8 ? "High chance to pay" : "Moderate chance"}
        </p>
      </div>
      
      <div className="mb-4 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
        {action.reason}
      </div>
      
      <button
        onClick={() => setShowPreview(true)}
        disabled={mutation.isPending}
        className="w-full rounded-xl bg-blue-600 py-3 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {mutation.isPending ? "Processing..." : "Collect Payment Now"}
      </button>

      {showPreview && (
        <div className="mt-4 rounded-xl border p-4 bg-gray-50 animate-in fade-in slide-in-from-top-2">
          <p className="text-sm mb-2 font-medium">Message Preview</p>
          <p className="text-sm text-gray-700 mb-4 bg-white p-3 rounded border">{action.tone}</p>
          <div className="flex gap-2">
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 rounded-lg bg-green-600 py-2 text-white font-semibold disabled:opacity-50"
            >
              Send Now
            </button>
            <button
              onClick={() => setShowPreview(false)}
              disabled={mutation.isPending}
              className="flex-1 rounded-lg border py-2 font-semibold hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
