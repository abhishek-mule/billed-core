import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function NextActions() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ 
    queryKey: ['actions'], 
    queryFn: () => fetch('/api/dashboard/actions').then(r => r.json()) 
  });
  
  const mutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/invoices/${id}/action`, { method: 'POST' }),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      // Clear feedback loop
      alert('You moved ₹12,500 closer to recovery. Great work!'); 
    }
  });

  if (isLoading) return <div className="h-48 bg-gray-200 animate-pulse rounded-lg" />;
  
  // Continuation State
  if (!data?.nextActions?.length) return (
    <div className="p-8 bg-gradient-to-br from-green-50 to-emerald-50 border border-emerald-200 rounded-3xl text-center shadow-sm">
      <h3 className="font-black text-emerald-900 text-lg">You've hit your daily goal! 🎉</h3>
      <p className="text-emerald-700 text-sm mt-2 font-medium">Progress saved. We'll track incoming payments and alert you if anything needs attention.</p>
    </div>
  );

  const action = data.nextActions[0];

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">🔥 Next Revenue Action</h2>
      <div className="bg-white p-6 rounded-3xl border-2 border-blue-600 shadow-2xl ring-4 ring-blue-50">
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase">Collect from</p>
            <p className="text-2xl font-black text-gray-900">{action.customerName}</p>
            <p className="text-5xl font-black text-blue-900 mt-2">₹{Number(action.amount).toLocaleString()}</p>
          </div>
          <div className="text-right">
             <span className="block px-3 py-1 bg-red-100 text-red-700 text-[10px] font-black rounded-full uppercase mb-1">Overdue</span>
             <span className="block text-[10px] text-blue-600 font-bold italic">High chance of payment</span>
          </div>
        </div>

        <button 
          onClick={() => mutation.mutate(action.invoiceId)}
          className="w-full bg-blue-900 text-white py-4 rounded-2xl font-black text-lg shadow-lg hover:bg-blue-800 transition active:scale-95"
        >
          {action.tone === 'gentle' ? 'Send Friendly Reminder' : 'Collect Payment Now'}
        </button>

        <div className="mt-4 text-center space-y-2">
          <p className="text-sm font-semibold text-gray-800 italic">"{action.reason}"</p>
          <p className="text-[10px] text-red-500 font-bold uppercase tracking-wide">Delaying reduces recovery chances</p>
          
          {/* Trust Bridge / Fallback */}
          <button className="text-[10px] text-gray-400 font-bold underline mt-4">
            Not relevant? Show another
          </button>
        </div>
        
        {!data.autoModeEnabled && (
          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-xs font-bold text-gray-500 mb-2">Automate this for ₹0 manual effort</p>
            <button className="text-blue-600 font-black text-sm hover:underline">Enable Auto-Recovery Mode →</button>
          </div>
        )}
      </div>
    </div>
  );
}
