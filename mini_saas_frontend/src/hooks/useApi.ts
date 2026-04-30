import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client'

export function useInvoices(tenantId?: string, limit = 10) {
  return useQuery({
    queryKey: ['invoices', tenantId, limit],
    queryFn: () => apiGet<{ success: boolean; invoices: any[] }>(`/api/merchant/invoices?limit=${limit}`),
    retry: 1,
    staleTime: 30000, // 30 seconds
  })
}

export function useCreateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => apiPost<any>(`/api/merchant/invoices/create`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useCustomers(search?: string, limit = 20) {
  return useQuery({
    queryKey: ['customers', search, limit],
    queryFn: () => apiGet<{ success: boolean; data: any[] }>(`/api/merchant/customers?q=${encodeURIComponent(search || '')}&limit=${limit}`),
    retry: 1,
    staleTime: 60000, // 1 minute
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => apiPost<any>(`/api/merchant/customers`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['parties'] })
    },
  })
}

export function useProducts(search?: string, page = 1, limit = 50) {
  return useQuery({
    queryKey: ['products', search, page, limit],
    queryFn: () => apiGet<{ success: boolean; data: any[]; pagination: any }>(`/api/merchant/products?search=${encodeURIComponent(search || '')}&page=${page}&limit=${limit}`),
    retry: 1,
    staleTime: 120000, // 2 minutes
  })
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => apiPost<any>(`/api/merchant/products`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiPut<any>(`/api/merchant/products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<any>(`/api/merchant/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiGet<{ success: boolean; stats: any; recentInvoices: any[] }>(`/api/merchant/stats`),
    retry: 2,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Auto-refresh every minute
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

export function usePurchases(search?: string, limit = 50) {
  return useQuery({
    queryKey: ['purchases', search, limit],
    queryFn: () => apiGet<{ success: boolean; data: any[] }>(`/api/merchant/purchases?search=${encodeURIComponent(search || '')}&limit=${limit}`),
    retry: 1,
    staleTime: 60000,
  })
}

export function useCreatePurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => apiPost<any>(`/api/merchant/purchases`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['products'] }) // Purchases affect inventory
    },
  })
}

export function useReports(period: string = 'month') {
  return useQuery({
    queryKey: ['reports', period],
    queryFn: () => apiGet<{ success: boolean; data: any }>(`/api/merchant/reports?period=${period}`),
    retry: 1,
    staleTime: 300000, // 5 minutes
  })
}