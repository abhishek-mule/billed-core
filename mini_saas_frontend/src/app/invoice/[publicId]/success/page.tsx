// src/app/invoice/[publicId]/success/page.tsx
import React from 'react';

export default function PaymentSuccessPage({ params }: { params: { publicId: string } }) {
  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-green-700 mb-2">Payment Successful!</h1>
        <p className="text-gray-600 mb-6">Thank you for your payment.</p>
        
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <p className="font-semibold text-gray-800">Want to get paid this fast by your own customers?</p>
          <a href={`/signup?ref=invoice_${params.publicId}`} 
             className="mt-4 block w-full bg-blue-600 text-white py-3 rounded-lg font-bold shadow-md hover:bg-blue-700 transition">
            Start Creating Invoices Free
          </a>
        </div>
      </div>
    </div>
  );
}
