// In-memory store for OTPs and sessions
// Note: In production, use Redis or a database

export interface Session {
  userId: string;
  tenantId: string | null;
  isPaid: boolean;
  phone?: string;
  email?: string;
  createdAt: number;
}

export const otpStore = new Map<string, { hash: string; createdAt: number }>();
export const sessionStore = new Map<string, Session>();
