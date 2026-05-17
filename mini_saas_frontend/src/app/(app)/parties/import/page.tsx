'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Users, X, AlertCircle, CheckCircle2, ArrowLeft, FileSpreadsheet, Phone, Plus } from 'lucide-react'
import { useContactImport } from '@/lib/billzo/useContactImport'
import { formatPhoneDisplay } from '@/lib/billzo/useContactImport'

export default function ImportCustomersPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { state, pickFromPhonebook, pickMultiple, parseCSV, checkDuplicates, submitImport, reset } = useContactImport()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseCSV(file)
  }

  const handleImport = async (mode: 'skip' | 'overwrite') => {
    const result = await submitImport(mode)
    if (result) {
      router.push('/parties')
    }
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/parties')} className="p-2 rounded-xl hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Import Customers</h1>
          <p className="text-sm text-muted-foreground">Add multiple customers at once</p>
        </div>
      </div>

      {state.error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      {state.contacts.length === 0 ? (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 p-8 text-center">
            <Users className="h-12 w-12 text-indigo-400 mx-auto" />
            <h3 className="mt-4 font-bold text-lg">Choose how to import</h3>
            <p className="mt-1 text-sm text-muted-foreground">Pick from phone contacts or upload a file</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={pickFromPhonebook}
              disabled={state.loading}
              className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition-all active:scale-95"
            >
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-green-50">
                <Phone className="h-7 w-7 text-green-600" />
              </div>
              <span className="font-bold text-sm">Pick from Phonebook</span>
              <span className="text-xs text-muted-foreground">1 contact at a time</span>
            </button>

            <button
              onClick={pickMultiple}
              disabled={state.loading}
              className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition-all active:scale-95"
            >
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-green-50">
                <Users className="h-7 w-7 text-green-600" />
              </div>
              <span className="font-bold text-sm">Pick Multiple</span>
              <span className="text-xs text-muted-foreground">Select many contacts</span>
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-muted-foreground">or upload a file</span>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 px-6 py-4 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <FileSpreadsheet className="h-5 w-5" />
                Upload CSV or Excel
              </button>
              <p className="text-xs text-muted-foreground">
                Required columns: Name, Phone — Optional: WhatsApp Number, GSTIN, Email
              </p>
              <button
                onClick={() => {
                  const csv = 'Name,Phone,WhatsApp Number,GSTIN,Email\nJohn Doe,+919876543210,,29AAACP1234C1Z5,john@example.com'
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'customers-template.csv'
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="text-xs text-indigo-600 underline"
              >
                Download template CSV
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-600 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {state.validCount} valid
              </span>
              {state.invalidCount > 0 && (
                <span className="flex items-center gap-1 text-red-500 font-medium">
                  <AlertCircle className="h-4 w-4" />
                  {state.invalidCount} invalid
                </span>
              )}
              {state.duplicateCount > 0 && (
                <span className="flex items-center gap-1 text-amber-500 font-medium">
                  <AlertCircle className="h-4 w-4" />
                  {state.duplicateCount} duplicates found
                </span>
              )}
            </div>
            <button onClick={reset} className="p-2 rounded-xl hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Phone</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.contacts.map((c, i) => (
                    <tr key={i} className={`border-t ${c.isDuplicate ? 'bg-amber-50' : ''}`}>
                      <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3">{formatPhoneDisplay(c.phone)}</td>
                      <td className="px-4 py-3">
                        {c.isDuplicate ? (
                          <span className="text-xs text-amber-600 font-medium">Will skip (exists)</span>
                        ) : (
                          <span className="text-xs text-green-600 font-medium">Will import</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 rounded-xl border py-3 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => handleImport('skip')}
              disabled={state.loading}
              className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {state.loading ? 'Importing...' : `Import ${state.contacts.filter(c => !c.isDuplicate).length} Customers`}
            </button>
          </div>
        </div>
      )}

      <div className="text-center">
        <button
          onClick={() => router.push('/parties/add')}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Or add customer manually
        </button>
      </div>
    </div>
  )
}