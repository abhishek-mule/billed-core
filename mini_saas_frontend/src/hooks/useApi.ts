import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const API_BASE = '/api'

export interface ApiError {
  error?: string
  details?: string
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || err.details || 'Request failed')
  }
  
  return res.json()
}

export function useInvoices(tenantId: string) {
  return useQuery({
    queryKey: ['invoices', tenantId],
    queryFn: () => fetchApi<any[]>(`${API_BASE}/v2/invoices?tenantId=${tenantId}`),
    enabled: !!tenantId,
  })
}

export function useCreateInvoice() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: any) => fetchApi<any>(`${API_BASE}/v2/invoices`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

export function useCustomers(tenantId: string) {
  return useQuery({
    queryKey: ['customers', tenantId],
    queryFn: () => fetchApi<any[]>(`${API_BASE}/merchant/customer/search?tenantId=${tenantId}&limit=100`),
    enabled: !!tenantId,
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: any) => fetchApi<any>(`${API_BASE}/merchant/customer`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useProducts(tenantId: string) {
  return useQuery({
    queryKey: ['products', tenantId],
    queryFn: () => fetchApi<any[]>(`${API_BASE}/merchant/products?tenantId=${tenantId}`),
    enabled: !!tenantId,
  })
}

export function useDashboardStats(tenantId: string) {
  return useQuery({
    queryKey: ['dashboard-stats', tenantId],
    queryFn: () => fetchApi<any>(`${API_BASE}/dashboard/today-summary`),
    enabled: !!tenantId,
    staleTime: 30000,
  })
}

export function useInvoiceSyncStatus(invoiceId: string) {
  return useQuery({
    queryKey: ['invoice-sync', invoiceId],
    queryFn: () => fetchApi<any>(`${API_BASE}/merchant/invoice/sync-status?id=${invoiceId}`),
    enabled: !!invoiceId,
    refetchInterval: 5000,
  })
}