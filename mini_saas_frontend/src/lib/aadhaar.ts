export interface AadhaarVerificationRequest {
  aadhaarNumber: string
  otp?: string
  referenceId?: string
}

export interface AadhaarVerificationResponse {
  success: boolean
  verified?: boolean
  referenceId?: string
  message: string
  data?: {
    name?: string
    gender?: string
    dob?: string
    address?: {
      careOf?: string
      houseNumber?: string
      street?: string
      location?: string
      vtc?: string
      district?: string
      state?: string
      pincode?: string
    }
  }
}

const MOCK_DELAY = 1500

export const initiateAadhaarVerification = async (
  aadhaarNumber: string
): Promise<AadhaarVerificationResponse> => {
  const cleanAadhaar = aadhaarNumber.replace(/\s/g, '')

  if (cleanAadhaar.length !== 12) {
    return {
      success: false,
      verified: false,
      message: 'Aadhaar number must be 12 digits',
    }
  }

  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY))

  const referenceId = `AADH_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`

  return {
    success: true,
    verified: false,
    referenceId,
    message: 'OTP sent to registered mobile',
  }
}

export const verifyAadhaarOTP = async (
  referenceId: string,
  otp: string
): Promise<AadhaarVerificationResponse> => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY))

  if (otp.length !== 6) {
    return {
      success: false,
      verified: false,
      message: 'OTP must be 6 digits',
    }
  }

  if (otp === '123456') {
    return {
      success: true,
      verified: true,
      referenceId,
      message: 'Aadhaar verified successfully',
      data: {
        name: 'MOCK_USER_NAME',
        gender: 'M',
        dob: '01-01-1990',
        address: {
          careOf: 'S/O: Mock Person',
          houseNumber: '123',
          street: 'Main Road',
          vtc: 'MOCK_CITY',
          district: 'MOCK_DISTRICT',
          state: 'Maharashtra',
          pincode: '411001',
        },
      },
    }
  }

  if (otp === '000000') {
    return {
      success: true,
      verified: false,
      message: 'OTP verification failed. Please try again.',
    }
  }

  return {
    success: false,
    verified: false,
    message: 'Invalid OTP. Please try again.',
  }
}

export const formatAadhaarNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  const parts = digits.match(/.{1,4}/g) || []
  return parts.join(' ')
}
