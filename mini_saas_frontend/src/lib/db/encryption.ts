import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(version: string = 'v1'): Buffer {
  const keyBase = process.env.CREDENTIAL_ENCRYPTION_KEY || 'fallback-key-32-bytes-need-change'
  const keyHash = crypto.createHash('sha256').update(`${keyBase}:${version}`).digest()
  return keyHash.subarray(0, 32)
}

export interface EncryptedCredential {
  ciphertext: string
  iv: string
  tag: string
}

export interface DecryptedCredential {
  apiKey: string
  apiSecret: string
  version: string
}

export function encryptWithVersion(
  apiKey: string, 
  apiSecret: string, 
  version: string = 'v1'
): EncryptedCredential {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(version), iv) as crypto.CipherGCM
  
  const keyBuffer = Buffer.from(apiKey, 'utf8')
  const secretBuffer = Buffer.from(apiSecret, 'utf8')
  
  const keyEncrypted = Buffer.concat([cipher.update(keyBuffer), cipher.final()])
  const keyTag = cipher.getAuthTag()
  
  cipher.final()
  
  const secretCipher = crypto.createCipheriv(ALGORITHM, getKey(version), iv) as crypto.CipherGCM
  const secretEncrypted = Buffer.concat([secretCipher.update(secretBuffer), secretCipher.final()])
  const secretTag = secretCipher.getAuthTag()
  
  return {
    ciphertext: Buffer.concat([keyEncrypted, secretEncrypted]).toString('base64'),
    iv: iv.toString('base64'),
    tag: Buffer.concat([keyTag, secretTag]).toString('base64'),
  }
}

export function decryptWithVersion(encrypted: EncryptedCredential): DecryptedCredential {
  const iv = Buffer.from(encrypted.iv, 'base64')
  const combined = Buffer.from(encrypted.ciphertext, 'base64')
  const half = Math.floor(combined.length / 2)
  
  const keyEncrypted = combined.subarray(0, half)
  const secretEncrypted = combined.subarray(half)
  
  const tags = Buffer.from(encrypted.tag, 'base64')
  const keyTag = tags.subarray(0, 16)
  const secretTag = tags.subarray(16, 32)
  
  const versions = ['v1', 'v2', 'v3']
  
  for (const version of versions) {
    try {
      const keyDecipher = crypto.createDecipheriv(ALGORITHM, getKey(version), iv) as crypto.DecipherGCM
      keyDecipher.setAuthTag(keyTag)
      const apiKey = Buffer.concat([keyDecipher.update(keyEncrypted), keyDecipher.final()]).toString('utf8')
      
      const secretDecipher = crypto.createDecipheriv(ALGORITHM, getKey(version), iv) as crypto.DecipherGCM
      secretDecipher.setAuthTag(secretTag)
      const apiSecret = Buffer.concat([secretDecipher.update(secretEncrypted), secretDecipher.final()]).toString('utf8')
      
      return { apiKey, apiSecret, version }
    } catch {
      continue
    }
  }
  
  throw new Error('Failed to decrypt credentials - key version mismatch')
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, useSalt, 32).toString('base64')
  return { hash, salt: useSalt }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = crypto.scryptSync(password, salt, 32).toString('base64')
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash))
}

export function generateId(prefix: string): string {
  const random = crypto.randomBytes(8).toString('hex')
  return `${prefix}_${random}`
}

export function generateApiKey(): string {
  return `bz_${crypto.randomBytes(12).toString('hex')}`
}

export function generateApiSecret(): string {
  return crypto.randomBytes(24).toString('hex')
}