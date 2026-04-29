'use client'

import {
  X,
  Printer,
  FileText,
  Share2,
  Check,
  Clock,
  Phone,
  ChevronLeft,
  Wifi,
  WifiOff,
  MessageCircle,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { useState } from 'react'

interface InvoiceItem {
  name: string
  qty: number
  rate: number
  gst: number
  hsn: string
}

interface Invoice {
  id: string
  date: string
  customerName: string
  customerPhone: string
  amount: number
  paymentStatus: 'PAID' | 'UNPAID' | 'PENDING'
  syncStatus: 'SYNCED' | 'LOCAL'
  items: InvoiceItem[]
}

interface InvoiceDetailsModalProps {
  invoice: Invoice | null
  isOpen: boolean
  onClose: () => void
}

export function InvoiceDetailsModal({
  invoice,
  isOpen,
  onClose,
}: InvoiceDetailsModalProps) {
  const [copied, setCopied] = useState(false)
  const [whatsappSent, setWhatsappSent] = useState(false)

  if (!isOpen || !invoice) return null

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n)

  const subtotal = invoice.items.reduce((a, i) => a + i.qty * i.rate, 0)
  const gstTotal = invoice.items.reduce(
    (a, i) => a + (i.qty * i.rate * i.gst) / 100,
    0
  )

  const paymentConfig = {
    PAID: {
      label: 'Paid',
      dot: '#10b981',
      bg: '#ecfdf5',
      text: '#065f46',
    },
    UNPAID: {
      label: 'Unpaid',
      dot: '#ef4444',
      bg: '#fef2f2',
      text: '#991b1b',
    },
    PENDING: {
      label: 'Pending',
      dot: '#f59e0b',
      bg: '#fffbeb',
      text: '#92400e',
    },
  }

  const pc = paymentConfig[invoice.paymentStatus]

  const handleCopy = () => {
    navigator.clipboard.writeText(invoice.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleWhatsapp = () => {
    setWhatsappSent(true)
    setTimeout(() => setWhatsappSent(false), 2500)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,700;1,9..144,400&family=DM+Sans:wght@400;500;600&display=swap');

        .inv-modal-backdrop {
          position: fixed; inset: 0; z-index: 50;
          display: flex; align-items: center; justify-content: center;
          padding: 1rem;
          background: rgba(15, 12, 8, 0.72);
          backdrop-filter: blur(6px);
          animation: backdropIn 0.2s ease;
        }
        @keyframes backdropIn { from { opacity: 0 } to { opacity: 1 } }

        .inv-modal {
          position: relative;
          width: 100%; max-width: 560px;
          max-height: 92vh;
          background: #faf8f4;
          border-radius: 28px;
          overflow: hidden;
          display: flex; flex-direction: column;
          animation: modalIn 0.28s cubic-bezier(0.34, 1.4, 0.64, 1);
          box-shadow: 0 32px 64px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.06);
          font-family: 'DM Sans', sans-serif;
        }
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97) }
          to   { opacity: 1; transform: translateY(0)   scale(1)    }
        }

        /* Header */
        .inv-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px 16px 16px;
          background: #faf8f4;
          border-bottom: 1px solid rgba(0,0,0,0.07);
          flex-shrink: 0;
        }
        .inv-back {
          display: flex; align-items: center; gap: 4px;
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
          color: #9b8e80; cursor: pointer; background: none; border: none;
          padding: 6px 8px; border-radius: 10px; transition: all 0.15s;
        }
        .inv-back:hover { background: rgba(0,0,0,0.05); color: #3d342b; }
        .inv-close {
          width: 32px; height: 32px; border-radius: 50%;
          background: rgba(0,0,0,0.06); border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #9b8e80; transition: all 0.15s;
        }
        .inv-close:hover { background: rgba(0,0,0,0.1); color: #3d342b; }

        /* Scroll Body */
        .inv-body {
          overflow-y: auto; flex: 1;
          padding: 20px;
          display: flex; flex-direction: column; gap: 12px;
          scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.1) transparent;
        }

        /* Hero Card */
        .inv-hero {
          background: #1a1410;
          border-radius: 20px;
          padding: 24px 24px 20px;
          position: relative; overflow: hidden;
        }
        .inv-hero::before {
          content: '';
          position: absolute; top: -40px; right: -40px;
          width: 180px; height: 180px; border-radius: 50%;
          background: radial-gradient(circle, rgba(245,158,11,0.18) 0%, transparent 70%);
          pointer-events: none;
        }
        .inv-hero-row {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 6px;
        }
        .inv-id-row {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 500; color: #6b5e50;
          letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px;
          cursor: pointer;
        }
        .inv-id-row:hover .inv-copy-icon { opacity: 1 }
        .inv-copy-icon { opacity: 0; transition: opacity 0.15s }
        .inv-amount {
          font-family: 'Fraunces', serif;
          font-size: 52px; font-weight: 700; line-height: 1;
          color: #faf8f4; letter-spacing: -2px;
        }
        .inv-date { font-size: 12px; font-weight: 500; color: #6b5e50; }

        /* Status pill */
        .inv-status-row { display: flex; gap: 8px; margin-top: 16px; align-items: center; }
        .inv-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 99px;
          font-size: 11px; font-weight: 600;
          background: rgba(255,255,255,0.07); color: #c9b9a8;
        }
        .inv-pill-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0 }
        .inv-pill.paid .inv-pill-dot   { background: #10b981 }
        .inv-pill.unpaid .inv-pill-dot { background: #ef4444 }
        .inv-pill.pending .inv-pill-dot{ background: #f59e0b }

        /* Sync strip */
        .inv-sync {
          display: flex; align-items: center; gap: 16px;
          margin-top: 16px; padding-top: 14px;
          border-top: 1px solid rgba(255,255,255,0.07);
        }
        .inv-sync-item {
          display: flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 500;
        }

        /* Section Card */
        .inv-card {
          background: #fff; border-radius: 18px;
          border: 1px solid rgba(0,0,0,0.06);
          overflow: hidden;
        }
        .inv-card-label {
          font-size: 10px; font-weight: 600; letter-spacing: 0.12em;
          text-transform: uppercase; color: #b5a89a;
          padding: 14px 18px 10px; border-bottom: 1px solid #f5f3ef;
        }

        /* Actions */
        .inv-actions-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px; padding: 14px;
        }
        .inv-action-btn {
          display: flex; align-items: center; justify-content: center; gap: 7px;
          padding: 13px 10px; border-radius: 14px;
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600;
          cursor: pointer; border: none; transition: all 0.18s;
          letter-spacing: 0.01em;
        }
        .btn-whatsapp {
          background: #22c55e; color: #fff;
          box-shadow: 0 4px 12px rgba(34,197,94,0.28);
          grid-column: span 2;
        }
        .btn-whatsapp:hover { background: #16a34a; transform: translateY(-1px); }
        .btn-whatsapp:active { transform: scale(0.98) }
        .btn-whatsapp.sent { background: #15803d }
        .btn-secondary {
          background: #f5f3ef; color: #5c4e43;
          border: 1px solid rgba(0,0,0,0.06);
        }
        .btn-secondary:hover { background: #ede9e3; transform: translateY(-1px) }
        .btn-secondary:active { transform: scale(0.98) }

        /* Customer */
        .inv-customer {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 18px;
        }
        .inv-avatar {
          width: 44px; height: 44px; border-radius: 50%;
          background: linear-gradient(135deg, #fde68a, #fbbf24);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Fraunces', serif;
          font-size: 18px; font-weight: 700; color: #92400e;
          flex-shrink: 0;
        }
        .inv-cust-name {
          font-size: 15px; font-weight: 600; color: #1a1410; margin-bottom: 2px;
        }
        .inv-cust-phone {
          font-size: 12px; font-weight: 500; color: #9b8e80;
          display: flex; align-items: center; gap: 4px;
        }
        .inv-cust-call {
          margin-left: auto; width: 36px; height: 36px; border-radius: 50%;
          background: #f0fdf4; border: 1px solid #bbf7d0;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #22c55e; transition: all 0.15s;
          flex-shrink: 0;
        }
        .inv-cust-call:hover { background: #dcfce7 }

        /* Items Table */
        .inv-items { padding: 0 }
        .inv-item-row {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding: 14px 18px;
          border-bottom: 1px solid #f5f3ef;
          transition: background 0.12s;
        }
        .inv-item-row:last-of-type { border-bottom: none }
        .inv-item-row:hover { background: #fafaf8 }
        .inv-item-name { font-size: 14px; font-weight: 600; color: #1a1410; margin-bottom: 3px }
        .inv-item-meta {
          font-size: 10px; font-weight: 500; color: #b5a89a;
          letter-spacing: 0.06em; text-transform: uppercase;
        }
        .inv-item-amount {
          font-family: 'Fraunces', serif;
          font-size: 16px; font-weight: 600; color: #1a1410;
          letter-spacing: -0.5px;
        }

        /* Totals */
        .inv-totals { padding: 16px 18px; background: #fafaf8; }
        .inv-total-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 4px 0;
        }
        .inv-total-label { font-size: 12px; font-weight: 500; color: #9b8e80 }
        .inv-total-val { font-size: 13px; font-weight: 600; color: #4a3f35 }
        .inv-grand-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 0 0; margin-top: 8px;
          border-top: 1px dashed rgba(0,0,0,0.1);
        }
        .inv-grand-label {
          font-family: 'Fraunces', serif;
          font-size: 16px; font-weight: 500; color: #1a1410;
        }
        .inv-grand-val {
          font-family: 'Fraunces', serif;
          font-size: 22px; font-weight: 700; color: #1a1410;
          letter-spacing: -1px;
        }

        /* Footer */
        .inv-footer {
          text-align: center; padding: 4px 0 8px;
          font-size: 10px; font-weight: 500;
          color: #c9b9a8; letter-spacing: 0.1em; text-transform: uppercase;
        }
        .inv-footer span { color: #a5968a }

        /* Receipt Tear */
        .inv-tear {
          height: 12px; background: #faf8f4;
          position: relative; overflow: hidden; flex-shrink: 0;
        }
        .inv-tear::after {
          content: '';
          position: absolute; bottom: 0; left: -4px; right: -4px; height: 16px;
          background: radial-gradient(circle at 50% 0, #fff 6px, transparent 7px) repeat-x;
          background-size: 18px 16px;
        }
      `}</style>

      <div className="inv-modal-backdrop" onClick={onClose}>
        <div className="inv-modal" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="inv-header">
            <button className="inv-back" onClick={onClose}>
              <ChevronLeft size={15} />
              All invoices
            </button>
            <button className="inv-close" onClick={onClose}>
              <X size={15} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="inv-body">

            {/* Hero — dark card */}
            <div className="inv-hero">
              <div
                className="inv-id-row"
                onClick={handleCopy}
                title="Copy invoice ID"
              >
                <FileText size={11} />
                {invoice.id}
                <span className="inv-copy-icon">
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                </span>
                {copied && (
                  <span style={{ color: '#10b981', fontSize: 10 }}>Copied!</span>
                )}
              </div>

              <div className="inv-hero-row">
                <div className="inv-amount">{fmt(invoice.amount)}</div>
                <div className="inv-date">{invoice.date}</div>
              </div>

              <div className="inv-status-row">
                <span
                  className={`inv-pill ${invoice.paymentStatus.toLowerCase()}`}
                >
                  <span className="inv-pill-dot" />
                  {pc.label}
                </span>
                <span className="inv-pill">Udhar</span>
              </div>

              <div className="inv-sync">
                {invoice.syncStatus === 'SYNCED' ? (
                  <span
                    className="inv-sync-item"
                    style={{ color: '#10b981' }}
                  >
                    <Wifi size={12} /> Synced to cloud
                  </span>
                ) : (
                  <>
                    <span
                      className="inv-sync-item"
                      style={{ color: '#10b981' }}
                    >
                      <Check size={12} /> Saved locally
                    </span>
                    <span
                      className="inv-sync-item"
                      style={{ color: '#f59e0b' }}
                    >
                      <Clock size={12} /> Syncs when online
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="inv-card">
              <div className="inv-card-label">Send to customer</div>
              <div className="inv-actions-grid">
                <button
                  className={`inv-action-btn btn-whatsapp ${whatsappSent ? 'sent' : ''}`}
                  onClick={handleWhatsapp}
                >
                  {whatsappSent ? (
                    <>
                      <Check size={15} /> Sent on WhatsApp
                    </>
                  ) : (
                    <>
                      <MessageCircle size={15} /> Send via WhatsApp
                    </>
                  )}
                </button>
                <button className="inv-action-btn btn-secondary">
                  <Printer size={14} /> Print
                </button>
                <button className="inv-action-btn btn-secondary">
                  <FileText size={14} /> PDF
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '0 14px 14px',
                }}
              >
                <button
                  className="inv-action-btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  <Share2 size={14} /> Share link
                </button>
                <button
                  className="inv-action-btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  <ExternalLink size={14} /> Open in ERPNext
                </button>
              </div>
            </div>

            {/* Customer */}
            <div className="inv-card">
              <div className="inv-card-label">Customer</div>
              <div className="inv-customer">
                <div className="inv-avatar">{invoice.customerName[0]}</div>
                <div>
                  <div className="inv-cust-name">{invoice.customerName}</div>
                  <div className="inv-cust-phone">
                    <Phone size={10} />
                    {invoice.customerPhone}
                  </div>
                </div>
                <a
                  href={`tel:${invoice.customerPhone}`}
                  className="inv-cust-call"
                  title="Call customer"
                >
                  <Phone size={15} />
                </a>
              </div>
            </div>

            {/* Items */}
            <div className="inv-card">
              <div className="inv-card-label">Items · {invoice.items.length}</div>
              <div className="inv-items">
                {invoice.items.map((item, i) => (
                  <div className="inv-item-row" key={i}>
                    <div>
                      <div className="inv-item-name">{item.name}</div>
                      <div className="inv-item-meta">
                        {item.qty} × ₹{item.rate.toLocaleString('en-IN')} &nbsp;·&nbsp; GST {item.gst}% &nbsp;·&nbsp; HSN {item.hsn}
                      </div>
                    </div>
                    <div className="inv-item-amount">
                      ₹{(item.qty * item.rate).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}

                <div className="inv-totals">
                  <div className="inv-total-row">
                    <span className="inv-total-label">Subtotal</span>
                    <span className="inv-total-val">
                      ₹{subtotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="inv-total-row">
                    <span className="inv-total-label">GST</span>
                    <span className="inv-total-val">
                      ₹{Math.round(gstTotal).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="inv-grand-row">
                    <span className="inv-grand-label">Total</span>
                    <span className="inv-grand-val">{fmt(invoice.amount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="inv-footer">
              Issued by <span>Ravi Electronics</span> &nbsp;·&nbsp; GSTIN 27ABCDE1234F1Z5
            </div>

          </div>

          {/* Tear-off strip at bottom */}
          <div className="inv-tear" />

        </div>
      </div>
    </>
  )
}