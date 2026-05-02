/**
 * Final Navigation Model for BillZo
 * Exactly 5 sections: Home, Invoices, Scan, Purchases, Settings.
 * Everything else is absorbed into flows.
 */

import { 
  Home, 
  FileText, 
  Camera, 
  ShoppingBag, 
  Settings 
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  icon: any
  path: string
  isPrimary?: boolean
}

export const NAVIGATION_ITEMS: NavItem[] = [
  { 
    id: 'dashboard', 
    label: 'Home', 
    icon: Home, 
    path: '/dashboard' 
  },
  { 
    id: 'invoices', 
    label: 'Invoices', 
    icon: FileText, 
    path: '/invoices' 
  },
  { 
    id: 'scan', 
    label: 'Scan', 
    icon: Camera, 
    path: '/scan',
    isPrimary: true 
  },
  { 
    id: 'purchases', 
    label: 'Purchases', 
    icon: ShoppingBag, 
    path: '/purchases' 
  },
  { 
    id: 'settings', 
    label: 'Settings', 
    icon: Settings, 
    path: '/settings' 
  }
]
