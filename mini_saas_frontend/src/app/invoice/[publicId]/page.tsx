import React from 'react';
import { notFound } from 'next/navigation';

async function getInvoice(publicId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/public/invoice/${publicId}`, {
    cache: 'no-store'
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function PublicInvoicePage({ params }: { params: { publicId: string } }) {
  const invoice = await getInvoice(params.publicId);
  if (!invoice) notFound();

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-sm p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{invoice.shopName}</h1>
          <p className="text-sm text-gray-500">Invoice: {invoice.invoiceNo}</p>
        </header>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Bill To</h2>
          <p className="text-gray-900">{invoice.customerName}</p>
        </section>

        <table className="w-full mb-6 text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item: any) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-3">{item.name} x {item.qty}</td>
                <td className="py-3 text-right">₹{item.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-right mb-8">
          <p className="text-sm text-gray-500">Grand Total</p>
          <p className="text-3xl font-bold text-gray-900">₹{invoice.total}</p>
        </div>

        <div className="text-center my-6">
          <p className="text-sm text-gray-500 mb-2">Scan to View/Pay Offline</p>
          <div className="w-32 h-32 bg-gray-200 mx-auto rounded flex items-center justify-center">
            [QR CODE]
          </div>
        </div>

        <button className="w-full bg-blue-600 text-white py-4 rounded-lg font-bold shadow-lg">
          Pay ₹{invoice.total}
        </button>
      </div>

      <footer className="mt-8 text-center text-sm text-gray-500">
        <p className="font-bold">Powered by Billzo</p>
        <a href="/signup" className="text-blue-600 font-semibold mt-2 block">
          Get paid faster with Billzo → Start Free
        </a>
      </footer>
    </div>
  );
}
