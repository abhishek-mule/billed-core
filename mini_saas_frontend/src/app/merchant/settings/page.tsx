'use client'

import { useState } from 'react'

const settingsSections = [
  { id: 'business', label: 'Business Info', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-2m-2 0m2 2l-2 2m2-2l2-2m2 2' },
  { id: 'notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.352 2.352 0 0118 15.158V13a6 6 0 10-12 0v2.159c0 .293-.114.58-.405.795L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'gst', label: 'GST Settings', icon: 'M9 14l6 6m0 0l-6-6m6 6V8' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.085 0-2.062-.27-2.92-.73-.857-.462-1.575-.917-2.08-.992-.691-.215-1.42-.27-2.064-.27-4.97 0-9 3.582-9 8 0 1.756.574 3.389 1.536 4.738m8.464 3.262A8 8 0 1112 20a8 8 0 01-8-8 8 0 018 8z' },
  { id: 'billing', label: 'Billing & Plan', icon: 'M3 10h18M7 15h1m1 4h1m-3-4h.01M9 21H7a2 2 0 01-2-2V7a2 2 0 012-2h3l3 3v10a2 2 0 01-2 2z' },
]

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('business')

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold text-white">Settings</h1>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {settingsSections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex items-center gap-2 ${
              activeSection === section.id
                ? 'bg-indigo-600 text-white'
                : 'bg-white/5 text-gray-400'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={section.icon} />
            </svg>
            {section.label}
          </button>
        ))}
      </div>

      {activeSection === 'business' && (
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Shop Name</label>
              <input type="text" defaultValue="Sharma Electronics" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">GSTIN</label>
              <input type="text" defaultValue="27AABCU9603R1ZX" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-sm uppercase" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Address</label>
              <textarea defaultValue="123 Main Road, Mumbai - 400001" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-sm" rows={3} />
            </div>
          </div>
          <button className="w-full py-3 bg-indigo-600 text-white font-medium rounded-lg">Save Changes</button>
        </div>
      )}

      {activeSection === 'notifications' && (
        <div className="space-y-3">
          {[
            { label: 'Invoice sent alerts', desc: 'Get notified when invoice is sent' },
            { label: 'Payment reminders', desc: 'Daily alerts for pending payments' },
            { label: 'Low stock alerts', desc: 'Alert when items are running low' },
            { label: 'Daily summary', desc: 'Receive daily sales summary' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
              <div>
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
              <button className="w-12 h-6 rounded-full bg-indigo-600 relative">
                <span className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
              </button>
            </div>
          ))}
        </div>
      )}

      {activeSection === 'billing' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
            <p className="text-sm opacity-80">Current Plan</p>
            <p className="text-2xl font-bold mt-1">Starter</p>
            <p className="text-sm opacity-80 mt-2">₹499/month • 300 invoices</p>
          </div>
          <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Invoices used</span>
              <span>82 / 300</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: '27%' }} />
            </div>
          </div>
          <button className="w-full py-3 border border-white/20 text-white font-medium rounded-lg">Upgrade Plan</button>
        </div>
      )}
    </div>
  )
}