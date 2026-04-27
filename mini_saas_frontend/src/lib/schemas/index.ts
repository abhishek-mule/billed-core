import { z } from 'zod'

// Customer validation
export const CustomerSchema = z.object({
  phone: z
    .string()
    .min(10, 'Phone must be 10 digits')
    .max(10, 'Phone must be 10 digits')
    .regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name too long'),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
})

// Invoice line item
export const InvoiceItemSchema = z.object({
  id: z.string(),
  itemCode: z.string().min(1, 'Item code required'),
  itemName: z.string().min(1, 'Item name required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  rate: z.number().min(0, 'Rate cannot be negative'),
  gstRate: z.number().refine(
    (val) => [0, 5, 12, 18, 28].includes(val),
    'Invalid GST rate'
  ),
  amount: z.number().optional(),
})

// Complete invoice form
export const CreateInvoiceSchema = z.object({
  customer: CustomerSchema,
  items: z.array(InvoiceItemSchema).min(1, 'At least one item required'),
  paymentMode: z.enum(['cash', 'upi', 'card', 'credit']),
  notes: z.string().optional(),
})

// Onboarding
export const OnboardSchema = z.object({
  shopName: z.string().min(2, 'Shop name must be at least 2 characters').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone number'),
  ownerName: z.string().min(2, 'Owner name required'),
  email: z.string().email('Invalid email'),
  plan: z.enum(['free', 'starter', 'pro']).default('free'),
})

// Login
export const LoginSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone number'),
  otp: z.string().length(6, 'OTP must be 6 digits').optional(),
})

// Customer
export const CustomerFormSchema = z.object({
  name: z.string().min(2, 'Name required'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone number'),
  gstin: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
})

// Product
export const ProductFormSchema = z.object({
  itemCode: z.string().min(1, 'Item code required'),
  itemName: z.string().min(1, 'Item name required'),
  hsnCode: z.string().optional(),
  rate: z.number().min(0, 'Rate required'),
  gstRate: z.number().refine(
    (val) => [0, 5, 12, 18, 28].includes(val),
    'Invalid GST rate'
  ),
})

// Type exports
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>
export type CustomerInput = z.infer<typeof CustomerSchema>
export type OnboardInput = z.infer<typeof OnboardSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type CustomerFormInput = z.infer<typeof CustomerFormSchema>
export type ProductFormInput = z.infer<typeof ProductFormSchema>
export type InvoiceItem = z.infer<typeof InvoiceItemSchema>