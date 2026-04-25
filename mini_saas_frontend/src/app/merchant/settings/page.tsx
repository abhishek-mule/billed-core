'use client'

import { useState } from 'react'
import { useSession } from '@/app/merchant/layout'

const sections = [
  {
    title: 'BUSINESS CONFIG',
    items: [
      { icon: '🏢', label: 'Business Profile', sub: 'Details, Logo, Signature' },
      { icon: '👥', label: 'Users & Roles', sub: 'Manage staff access (Admin, Staff)' },
    ],
  },
  {
    title: 'WORKFLOW & AUTOMATION',
    items: [
      { icon: '📄', label: 'Invoice Preferences', sub: 'Numbering, auto-GST' },
      { icon: '📷', label: 'Magic Scan (OCR)', sub: 'Configure auto-scan & accuracy', badge: 'PRO' },
      { icon: '💳', label: 'Payments', sub: 'UPI, bank accounts, gateways' },
    ],
  },
  {
    title: 'REPORTING',
    items: [
      { icon: '📊', label: 'Reports & Tax', sub: 'FY selection, export formats' },
      { icon: '🔔', label: 'Notifications', sub: 'Payment reminders, summaries' },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { icon: '🌐', label: 'Language & Region', sub: 'INR, Timezone' },
      { icon: '🔒', label: 'Security', sub: 'Password, 2FA, Devices' },
      { icon: '💾', label: 'Data & Backup', sub: 'Export data, Auto-backup' },
    ],
  },
]

export default function SettingsPage() {
  const session = useSession()

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5">
        <div className="text-2xl font-black mb-5">Settings</div>

        {/* Profile card */}
        <div className="bg-blue-50 rounded-2xl p-4 flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
            {session?.companyName?.[0] || 'R'}
          </div>
          <div className="flex-1">
            <div className="font-bold text-lg">{session?.companyName || 'Rahul Traders'}</div>
            <div className="text-sm text-gray-600">GSTIN: 27AADCB2230M1Z2</div>
          </div>
          <button className="px-4 py-2 rounded-full bg-white border-none text-blue-600 font-semibold cursor-pointer">
            Edit
          </button>
        </div>

        {sections.map((sec, si) => (
          <div key={si} className="mb-6">
            <div className="text-xs font-bold tracking-widest text-gray-400 mb-2">
              {sec.title}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {sec.items.map((item, ii) => (
                <div
                  key={ii}
                  className="flex items-center gap-4 p-4 cursor-pointer"
                  style={{
                    borderBottom: ii < sec.items.length - 1 ? '1px solid #F0F2F7' : 'none',
                  }}
                >
                  <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center text-xl">
                    {item.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{item.label}</span>
                      {item.badge && (
                        <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400">{item.sub}</div>
                  </div>
                  <span className="text-gray-300 text-2xl">›</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="mb-4">
          <div className="text-xs font-bold tracking-widest text-gray-400 mb-2">DANGER ZONE</div>
          <div className="bg-white rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4 p-4">
              <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center text-xl">
                🚪
              </div>
              <span className="text-red-600 font-bold">Sign Out</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}