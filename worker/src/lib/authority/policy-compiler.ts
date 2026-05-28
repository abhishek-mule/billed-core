// ============================================================
// Authority Gateway — Policy Compiler & Bootstrap
// ============================================================
// Compiles TS policy bundles into canonical hashed bundles,
// persisted immutably in authority_policies.
//
// bootstrapPoliciesIfEmpty() runs at worker startup to seed
// the default policy bundle on first deployment.
// ============================================================

import { sha256 } from './hashing'
import type { PolicyBundle, SovereigntyRule } from './schemas'

// ============================================================
// Default Policy Bundle - v2026.05.28-alpha
// ============================================================
// This is the initial constitution.  Modify via new versions,
// never by editing this one in-place.
// ============================================================

const RULES_V1: readonly SovereigntyRule[] = [
  {
    intent: 'tenant.provision',
    allowedSources: ['n8n_prod', 'provisioning_sidecar'],
    allowedPlans: ['premium', 'enterprise'],
    minIntentVersion: 1,
    maxIntentVersion: 1,
  },
  {
    intent: 'tenant.deprovision',
    allowedSources: ['n8n_prod', 'admin'],
    allowedPlans: ['premium', 'enterprise', 'standard'],
    rateLimit: { perHour: 2 },
  },
  {
    intent: 'invoice.gst.submit',
    allowedSources: ['n8n_prod', 'worker'],
    rateLimit: { perMinute: 30 },
  },
  {
    intent: 'payment.reconcile',
    allowedSources: ['worker', 'internal_worker'],
    rateLimit: { perMinute: 60 },
  },
  {
    intent: 'whatsapp.send.template',
    allowedSources: ['n8n_prod', 'worker'],
    allowedPlans: ['premium', 'standard', 'starter'],
    rateLimit: { perHour: 1000 },
  },
  {
    intent: 'whatsapp.send',
    allowedSources: ['worker', 'internal_worker'],
    rateLimit: { perMinute: 100 },
  },
  {
    intent: 'invoice.issue',
    allowedSources: ['worker', 'app'],
    rateLimit: { perMinute: 30 },
  },
  {
    intent: 'ledger.write',
    allowedSources: ['frappe'],
  },
  {
    intent: 'invoice.gst.calculate',
    allowedSources: ['n8n_prod', 'worker'],
    rateLimit: { perMinute: 60 },
  },
  {
    intent: 'kyc.aadhaar.verify',
    allowedSources: ['n8n_prod', 'worker'],
    rateLimit: { perHour: 100 },
  },
]

export const DEFAULT_POLICY_BUNDLE_V1: PolicyBundle = {
  policyVersion: '2026.05.28-alpha',
  rules: RULES_V1,
}

// ============================================================
// Compilation
// ============================================================

/**
 * Canonicalize a policy bundle into a stable JSON representation.
 * Key ordering is deterministic (sorted).  Used for hashing.
 */
export function canonicalizePolicyBundle(bundle: PolicyBundle): string {
  const sorted = {
    policyVersion: bundle.policyVersion,
    rules: bundle.rules.map((r) => ({
      intent: r.intent,
      allowedSources: [...r.allowedSources].sort(),
      ...(r.allowedPlans !== undefined ? { allowedPlans: [...r.allowedPlans].sort() } : {}),
      ...(r.rateLimit !== undefined ? { rateLimit: r.rateLimit } : {}),
      ...(r.requiredCapabilities !== undefined
        ? { requiredCapabilities: [...r.requiredCapabilities].sort() }
        : {}),
      ...(r.minIntentVersion !== undefined ? { minIntentVersion: r.minIntentVersion } : {}),
      ...(r.maxIntentVersion !== undefined ? { maxIntentVersion: r.maxIntentVersion } : {}),
    })),
  }

  return JSON.stringify(sorted, Object.keys(sorted).sort())
}

/**
 * Compute the policy snapshot hash for a bundle.
 * This is the SHA256 of the canonicalized JSON.
 */
export function hashPolicyBundle(bundle: PolicyBundle): string {
  const canonical = canonicalizePolicyBundle(bundle)
  return sha256(canonical)
}

// ============================================================
// Bootstrap Manifest — computed at module-eval time (deterministic)
// ============================================================

export const BOOTSTRAP_POLICYSET_VERSION: string = DEFAULT_POLICY_BUNDLE_V1.policyVersion
export const BOOTSTRAP_POLICYSET_HASH: string = hashPolicyBundle(DEFAULT_POLICY_BUNDLE_V1)

// ============================================================
// Bootstrap
// ============================================================

/**
 * Configuration for the bootstrap function.
 * The caller injects Supabase so this module stays testable.
 */
export interface PolicyBootstrapConfig {
  readonly supabaseAdmin: {
    from: (table: string) => {
      select: (columns: string) => {
        limit: (n: number) => Promise<{ data: any[] | null; error: any }>
      }
      insert: (rows: any[]) => Promise<{ error: any }>
    }
  }
  readonly createdBy: string
}

/**
 * Bootstrap the default policy bundle if the authority_policies table
 * is empty.  Called once at worker startup.
 *
 * This is intentionally idempotent — if a policy already exists,
 * no action is taken.  New policy versions are introduced via
 * code deploys, not runtime DB writes.
 */
export async function bootstrapPoliciesIfEmpty(config: PolicyBootstrapConfig): Promise<{
  seeded: boolean
  version: string
  snapshotHash: string
}> {
  const { data: existing } = await config.supabaseAdmin
    .from('authority_policies')
    .select('policy_version')
    .limit(1)

  if (existing && existing.length > 0) {
    return {
      seeded: false,
      version: existing[0].policy_version,
      snapshotHash: '', // caller can fetch if needed
    }
  }

  const bundle = DEFAULT_POLICY_BUNDLE_V1
  const snapshotHash = hashPolicyBundle(bundle)

  const row = {
    policy_version: bundle.policyVersion,
    policy_snapshot_hash: snapshotHash,
    policy_bundle: JSON.parse(canonicalizePolicyBundle(bundle)),
    created_by: config.createdBy,
  }
  const { error } = await config.supabaseAdmin
    .from('authority_policies')
    .insert([row])

  if (error) {
    throw new Error(`Failed to seed authority_policies: ${error.message}`)
  }

  return {
    seeded: true,
    version: bundle.policyVersion,
    snapshotHash,
  }
}

/**
 * Wrapper around bootstrapPoliciesIfEmpty with explicit manifest emission.
 *
 * Ensures the minimum required policy set exists in the database.
 *
 * On first deploy: seeds DEFAULT_POLICY_BUNDLE_V1.
 * On subsequent deploys: idempotent — does nothing.
 *
 * Emits the bootstrap manifest hash and version for runtime fingerprinting.
 */
export async function ensureMinimumPolicySet(config: PolicyBootstrapConfig): Promise<{
  seeded: boolean
  version: string
  snapshotHash: string
}> {
  const result = await bootstrapPoliciesIfEmpty(config)

  if (result.seeded) {
    console.log(
      `[PolicyBootstrapper] Seeded policy set: ` +
      `version=${BOOTSTRAP_POLICYSET_VERSION} hash=${BOOTSTRAP_POLICYSET_HASH}`,
    )
  } else {
    console.log(
      `[PolicyBootstrapper] Policy set already exists: version=${result.version}`,
    )
  }

  return result
}
