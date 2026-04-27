import { z } from 'zod'

export const OnboardSchema = z.object({
  shopName: z.string().min(2, 'Shop name must be at least 2 characters').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone number'),
  ownerName: z.string().min(2, 'Owner name required'),
  email: z.string().email('Invalid email'),
  plan: z.enum(['free', 'starter', 'pro']).optional(),
  idempotencyKey: z.string().optional(),
  // Allow extra fields (but don't fail on them)
}).passthrough()

export const InvoiceCreateSchema = z.object({
  customerName: z.string().min(1, 'Customer name required'),
  customerGstin: z.string().optional(),
  customerPhone: z.string().optional(),
  items: z.array(z.object({
    itemCode: z.string(),
    itemName: z.string(),
    qty: z.number().positive(),
    rate: z.number().min(0),
    amount: z.number(),
    hsnCode: z.string().optional(),
  })).min(1, 'At least one item required'),
  subtotal: z.number().positive(),
  cgst: z.number().min(0),
  sgst: z.number().min(0),
  igst: z.number().min(0),
  total: z.number().positive(),
  paymentMode: z.enum(['cash', 'upi', 'card', 'credit']).default('cash'),
  placeOfSupply: z.string().default('Maharashtra'),
})

export const CustomerCreateSchema = z.object({
  name: z.string().min(2, 'Name required'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone number'),
  gstin: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
})

export const ProductCreateSchema = z.object({
  itemCode: z.string().min(1, 'Item code required'),
  itemName: z.string().min(1, 'Item name required'),
  hsnCode: z.string().optional(),
  rate: z.number().min(0, 'Rate required'),
  gstRate: z.number().refine(
    (val) => [0, 5, 12, 18, 28].includes(val),
    'Invalid GST rate'
  ),
})

export const LoginSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone number'),
  otp: z.string().length(6, 'OTP must be 6 digits').optional(),
})

export type OnboardInput = z.infer<typeof OnboardSchema>
export type InvoiceCreateInput = z.infer<typeof InvoiceCreateSchema>
export type CustomerCreateInput = z.infer<typeof CustomerCreateSchema>
export type ProductCreateInput = z.infer<typeof ProductCreateSchema>
export type LoginInput = z.infer<typeof LoginSchema>

// Legacy alias for backward compatibility
export type OnboardingRequest = Partial<OnboardInput>

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data as T }
  }
  const messages = result.error.issues.map(i => i.message).join(', ')
  return { success: false, error: messages }
}