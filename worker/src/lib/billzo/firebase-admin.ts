import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'

function getServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson)
      return {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key?.replace(/\\n/g, '\n'),
      }
    } catch {
      console.error('[FirebaseAdmin] Invalid FIREBASE_SERVICE_ACCOUNT_JSON')
      return null
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) return null

  return { projectId, clientEmail, privateKey }
}

let app: App | null = null

export function getFirebaseAdminApp(): App | null {
  if (app) return app

  const existing = getApps()[0]
  if (existing) {
    app = existing
    return app
  }

  const serviceAccount = getServiceAccount()
  if (!serviceAccount) return null

  app = initializeApp({
    credential: cert(serviceAccount),
  })

  return app
}
