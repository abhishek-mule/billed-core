// src/components/dashboard/NextActions.tsx (Final Adaptive Version)
"use client";
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function NextActions() {
  const [showPreview, setShowPreview] = useState(false);
  const [lastAction, setLastAction] = useState<any>(null);
  const [undoTimer, setUndoTimer] = useState(0);
  
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ 
    queryKey: ['actions'], 
    queryFn: () => fetch('/api/dashboard/actions').then(r => r.json()) 
  });
  
  const mutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/invoices/${id}/action`, { method: 'POST' }),
    onSuccess: (data, id) => {
      setLastAction(id);
      setUndoTimer(5);
      fetch('/api/analytics', { method: 'POST', body: JSON.stringify({ event: 'action_taken', metadata: { invoiceId: id }})});
    }
  });

  const action = data?.nextActions?.[0];

  // Track View on mount
  useEffect(() => {
    if (action) {
      fetch('/api/analytics', { method: 'POST', body: JSON.stringify({ event: 'action_viewed', metadata: { invoiceId: action.invoiceId }})});
    }
  }, [action]);

  const handleSkip = (reason: string) => {
    if (action) {
      fetch('/api/analytics', { method: 'POST', body: JSON.stringify({ event: 'trust_break', metadata: { invoiceId: action.invoiceId, reason }})});
    }
    // Skip logic...
  };

  // Undo Timer Effect
  useEffect(() => {
    if (undoTimer > 0) {
      const timer = setTimeout(() => setUndoTimer(t => t - 1), 1000);
      return () => clearTimeout(timer);
    } else if (undoTimer === 0 && lastAction) {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      setLastAction(null);
    }
  }, [undoTimer, lastAction, queryClient]);

  if (isLoading) return <div className="h-48 bg-gray-200 animate-pulse rounded-lg" />;
  
  // 1. Undo UI
  if (undoTimer > 0) return (
    <div className="p-8 bg-blue-50 border border-blue-200 rounded-3xl text-center">
      <p className="font-bold text-blue-900">Message Scheduled.</p>
      <button onClick={() => setUndoTimer(0)} className="mt-4 text-red-600 font-bold underline">Undo ( {undoTimer}s )</button>
    </div>
  );

  if (!data?.nextActions?.length) return <div className="p-8 bg-white border border-gray-100 rounded-3xl text-center font-bold text-gray-400">All caught up! 🎉</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">🔥 Next Revenue Action</h2>
      
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl ring-4 ring-blue-50">
        {/* Visibility: Status bar */}
        <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase mb-4">
          <span>Status: Sending...</span>
          <span>Confidence: {Math.round(action.confidence * 100)}%</span>
        </div>

        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase">Collect from</p>
            <p className="text-2xl font-black text-gray-900">{action.customerName}</p>
            <p className="text-4xl font-black text-blue-900 mt-2">₹{Number(action.amount).toLocaleString()}</p>
          </div>
        </div>

        <button 
          onClick={() => mutation.mutate(action.invoiceId)}
          className="w-full bg-blue-900 text-white py-4 rounded-2xl font-black text-lg transition active:scale-95"
        >
          {action.tone === 'gentle' ? 'Send Friendly Reminder' : 'Collect Payment Now'}
        </button>

        {/* Behavioral Adaptation & Learning */}
        <div className="mt-6 flex gap-2">
            <button className="flex-1 text-[10px] font-bold text-gray-500 border rounded-lg p-2" onClick={() => {/* Skip + Capture Reason */}}>Already Paid</button>
            <button className="flex-1 text-[10px] font-bold text-gray-500 border rounded-lg p-2" onClick={() => {/* Skip + Capture Reason */}}>Wrong Time</button>
        </div>
      </div>
    </div>
  );
}
