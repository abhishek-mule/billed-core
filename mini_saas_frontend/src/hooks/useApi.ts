import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api-client'

export function useInvoices(tenantId?: string, limit = 10) {
  return useQuery({
    queryKey: ['invoices', tenantId, limit],
    queryFn: () => apiGet<{ invoices: any[] }>(`/api/merchant/invoices?limit=${limit}`),
    // If you're doing global tenant logic, maybe enabled: !!tenantId, but often not needed since cookie auth
  })
}

export function useCreateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => apiPost<any>(`/api/merchant/invoices`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })
}

export function useCustomers(search?: string, limit = 20) {
  return useQuery({
    queryKey: ['customers', search, limit],
    queryFn: () => apiGet<{ success: boolean; data: any[] }>(`/api/merchant/customers?q=${encodeURIComponent(search || '')}&limit=${limit}`),
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => apiPost<any>(`/api/merchant/customers`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useProducts(search?: string, page = 1, limit = 50) {
  return useQuery({
    queryKey: ['products', search, page, limit],
    queryFn: () => apiGet<{ success: boolean; data: any[]; pagination: any }>(`/api/merchant/products?search=${encodeURIComponent(search || '')}&page=${page}&limit=${limit}`),
  })
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiGet<{ success: boolean; stats: any; recentInvoices: any[] }>(`/api/merchant/stats`),
    staleTime: 30000,
  })
}

export function useInvoiceSyncStatus(invoiceId: string) {
  return useQuery({
    queryKey: ['invoice-sync', invoiceId],
    queryFn: () => apiGet<any>(`/api/merchant/invoice/sync-status?id=${invoiceId}`),
    enabled: !!invoiceId,
    refetchInterval: 5000,
  })
}