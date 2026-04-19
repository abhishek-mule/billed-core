export type Language = 'en' | 'hi'

export interface Translations {
  [key: string]: string
}

const translations: Record<Language, Translations> = {
  en: {
    home: 'Home',
    invoice: 'Invoice',
    customers: 'Customers',
    products: 'Products',
    newInvoice: 'New Invoice',
    scanBill: 'Scan Bill',
    todaySales: "Today's Sales",
    invoices: 'Invoices',
    pending: 'Pending',
    lowStock: 'Low Stock',
    quickActions: 'Quick Actions',
    recentSales: 'Recent Sales',
    viewAll: 'View All',
    paid: 'Paid',
    due: 'Due',
    customerPhone: 'Customer Phone',
    selectCustomer: 'Select or add customer',
    addNewCustomer: '+ Add New Customer',
    addItem: '+ Add Item',
    searchProduct: 'Search items...',
    total: 'Total',
    sendWhatsApp: 'Send via WhatsApp',
    sending: 'Sending...',
    invoiceSent: 'Invoice Sent!',
    gst: 'GST (18%)',
    subtotal: 'Subtotal',
    online: 'Online',
    offline: 'Offline',
    noInvoices: 'No invoices yet',
    createFirstInvoice: 'Create your first invoice',
    goToInvoice: 'Create Invoice',
  },
  hi: {
    home: 'होम',
    invoice: 'बिल',
    customers: 'ग्राहक',
    products: 'सामान',
    newInvoice: 'नया बिल',
    scanBill: 'बिल स्कैन करें',
    todaySales: 'आज की बिक्री',
    invoices: 'बिल',
    pending: 'बकाया',
    lowStock: 'कम स्टॉक',
    quickActions: 'त्वरित कार्य',
    recentSales: 'हाल की बिक्री',
    viewAll: 'सभी देखें',
    paid: 'भुगतान',
    due: 'देय',
    customerPhone: 'ग्राहक फोन',
    selectCustomer: 'ग्राहक चुनें',
    addNewCustomer: '+ नया ग्राहक',
    addItem: '+ आइटम जोड़ें',
    searchProduct: 'सामान खोजें...',
    total: 'कुल',
    sendWhatsApp: 'WhatsApp पर भेजें',
    sending: 'भेज रहे हैं...',
    invoiceSent: 'बिल भेज दिया!',
    gst: 'GST (18%)',
    subtotal: 'उप-योग',
    online: 'ऑनलाइन',
    offline: 'ऑफलाइन',
    noInvoices: 'कोई बिल नहीं',
    createFirstInvoice: 'अपना पहला बिल बनाएं',
    goToInvoice: 'बिल बनाएं',
  }
}

export function t(key: string, lang: Language = 'en'): string {
  return translations[lang]?.[key] || translations['en']?.[key] || key
}

export function getTranslations(lang: Language): Translations {
  return translations[lang]
}

export function detectLanguage(): Language {
  if (typeof window === 'undefined') return 'en'
  
  const saved = localStorage.getItem('billed_lang') as Language
  if (saved && translations[saved]) return saved
  
  const browserLang = navigator.language.split('-')[0]
  if (browserLang === 'hi') return 'hi'
  
  return 'en'
}

export function setLanguage(lang: Language): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('billed_lang', lang)
}