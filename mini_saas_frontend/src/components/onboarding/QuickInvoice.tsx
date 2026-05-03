// src/components/onboarding/QuickInvoice.tsx
"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function QuickInvoice() {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSend = async () => {
    setLoading(true);
    await fetch('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        customer: { name: 'Customer', phone },
        lineItems: [{ name: 'Goods', qty: 1, rate: amount, gstRate: 0 }]
      })
    });
    router.push('/dashboard?onboarding=success');
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-xl shadow-lg border">
      <h2 className="text-xl font-bold mb-4">Send your first invoice</h2>
      <input className="w-full p-3 mb-3 border rounded" placeholder="Customer Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input className="w-full p-3 mb-6 border rounded" placeholder="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button 
        onClick={handleSend} 
        disabled={loading}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold"
      >
        {loading ? 'Sending...' : 'Send Invoice via WhatsApp'}
      </button>
    </div>
  );
}
