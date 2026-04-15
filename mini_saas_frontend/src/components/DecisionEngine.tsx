'use client'

import { motion } from 'framer-motion'

interface DecisionCard {
  id: string
  title: string
  insight: string
  reasoning: string
  action: string
  type: 'opportunity' | 'risk' | 'warning'
}

const decisions: DecisionCard[] = [
  {
    id: '1',
    title: 'Inventory Opportunity',
    insight: 'Restock Polycab 2.5mm Wire',
    reasoning: 'Legacy Tally data predicted a low-demand April. However, your Magic Scan billing rate for cables is trending 35% higher than 2023. Current stock (12 units) will deplete in 4 days.',
    action: 'Order 50 Units Now',
    type: 'opportunity'
  },
  {
    id: '2',
    title: 'Cash Flow Risk',
    insight: '₹50k GST Shortfall Predicted',
    reasoning: 'Your GST filing is due on the 20th. While Sales are high, your current payment link completion rate (avg 6.2 days) indicates you will not have sufficient cash-on-hand by the 19th.',
    action: 'Nudge Pending Dues',
    type: 'risk'
  },
  {
    id: '3',
    title: 'Margin Leak Detected',
    insight: 'Adjust Philips LED Pricing',
    reasoning: 'Wholesale procurement price for 9W LEDs rose by 8% this week. Your current invoice price (₹120) is still using the month-old rate, causing a 5% margin erosion per unit.',
    action: 'Update Master Price',
    type: 'warning'
  }
]

export default function DecisionEngine() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tighter italic uppercase text-indigo-400">
            Decision Engine
          </h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">
             Reasoning based on Legacy + Real-time Data
          </p>
        </div>
        <div className="flex -space-x-2">
           <div className="w-8 h-8 rounded-full border-2 border-[#050505] bg-emerald-500 flex items-center justify-center text-[10px] font-black text-black">T</div>
           <div className="w-8 h-8 rounded-full border-2 border-[#050505] bg-amber-500 flex items-center justify-center text-[10px] font-black text-black">M</div>
           <div className="w-8 h-8 rounded-full border-2 border-[#050505] bg-indigo-500 flex items-center justify-center text-[10px] font-black text-black italic">B</div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {decisions.map((decision, i) => (
          <motion.div 
            key={decision.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className={`relative p-6 rounded-[2rem] border transition-all hover:scale-[1.02] ${
              decision.type === 'opportunity' ? 'bg-emerald-500/5 border-emerald-500/20' :
              decision.type === 'risk' ? 'bg-rose-500/5 border-rose-500/20' : 'bg-amber-500/5 border-amber-500/20'
            }`}
          >
            <div className={`text-[10px] font-black uppercase tracking-widest mb-4 inline-block px-3 py-1 rounded-full ${
              decision.type === 'opportunity' ? 'bg-emerald-500/10 text-emerald-400' :
              decision.type === 'risk' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
            }`}>
              {decision.title}
            </div>

            <h3 className="text-lg font-black tracking-tight mb-2">{decision.insight}</h3>
            
            <div className="relative mb-6">
              <p className="text-sm text-gray-400 leading-relaxed italic">
                "{decision.reasoning}"
              </p>
              <div className="absolute -left-3 top-0 bottom-0 w-1 bg-white/10 rounded-full" />
            </div>

            <button className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition shadow-xl ${
              decision.type === 'opportunity' ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-emerald-500/20' :
              decision.type === 'risk' ? 'bg-rose-500 text-white hover:bg-rose-400 shadow-rose-500/20' : 'bg-amber-500 text-black hover:bg-amber-400 shadow-amber-500/20'
            }`}>
              {decision.action}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
