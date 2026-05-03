interface AadhaarVerification {
  aadhaar: string
  expires: number
}

// In-memory store for verification data (OTP reference)
// In production, use Redis or a database
export const verificationStore = new Map<string, AadhaarVerification>()
