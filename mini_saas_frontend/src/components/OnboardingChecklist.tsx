'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

interface ChecklistItem {
  id: string
  label: string
  labelHi: string
  emoji: string
  completed: boolean
}

interface OnboardingChecklistProps {
  tenantId?: string
}

export default function OnboardingChecklist({ tenantId }: OnboardingChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([
    { id: 'shopName', label: 'Set Shop Name', labelHi: 'Shop का नाम सेट करें', emoji: '🏪', completed: false },
    { id: 'firstInvoice', label: 'Create First Invoice', labelHi: 'पहला बिल बनाएं', emoji: '🧾', completed: false },
    { id: 'firstWhatsApp', label: 'Send via WhatsApp', labelHi: 'WhatsApp पर भेजें', emoji: '📱', completed: false },
    { id: 'addCustomer', label: 'Add Your Customer', labelHi: 'ग्राहक जोड़ें', emoji: '👥', completed: false },
  ])

  const [lang, setLang] = useState<'en' | 'hi'>('en')

  const progress = Math.round((items.filter(i => i.completed).length / items.length) * 100)

  const toggleItem = async (id: string) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ))
    
    if (!items.find(i => i.id === id)?.completed && tenantId) {
      try {
        await fetch('/api/onboarding/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, checklistId: id }),
        })
      } catch (e) {
        console.error('[Checklist] Update failed:', e)
      }
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <h3 className="font-semibold text-white">Onboarding Checklist</h3>
        </div>
        <button
          onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
          className="text-xs px-2 py-1 bg-white/10 rounded text-gray-400"
        >
          {lang === 'en' ? 'हिं' : 'EN'}
        </button>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{progress}% Complete</span>
          <span>{items.filter(i => i.completed).length}/{items.length}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 100 }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <motion.button
            key={item.id}
            onClick={() => toggleItem(item.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
              item.completed
                ? 'bg-emerald-500/10 border border-emerald-500/30'
                : 'bg-white/5 border border-white/10 hover:border-white/20'
            }`}
          >
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-lg transition-all ${
              item.completed
                ? 'bg-emerald-500 text-white'
                : 'bg-white/10 text-gray-500'
            }`}>
              {item.completed ? '✓' : item.emoji}
            </span>
            <span className={`flex-1 text-left font-medium ${
              item.completed ? 'text-emerald-400' : 'text-white'
            }`}>
              {lang === 'en' ? item.label : item.labelHi}
            </span>
            {item.completed && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-xs text-emerald-400"
              >
                Done!
              </motion.span>
            )}
          </motion.button>
        ))}
      </div>

      {progress === 100 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl text-center"
        >
          <p className="text-indigo-400 font-semibold">🎉 Onboarding Complete!</p>
          <p className="text-xs text-gray-400 mt-1">You're ready to grow your business</p>
        </motion.div>
      )}
    </div>
  )
}