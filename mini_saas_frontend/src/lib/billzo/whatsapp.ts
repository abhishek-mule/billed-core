import { createWhatsAppDomain, createWhatsAppServer } from '@billzo/shared/whatsapp'
import { supabaseAdmin } from './supabase-admin'

/**
 * Frontend bindings for the shared WhatsApp webhook domain (Step 3 extraction).
 *
 * The domain/server logic lives in @billzo/shared/whatsapp, client-injected.
 * This module binds the frontend's service-role supabaseAdmin once; the worker
 * binds its own copy of the same client. The webhook route itself does NOT use
 * these bindings — it only ingests into webhook_inbox.
 */
export const whatsAppServer = createWhatsAppServer(supabaseAdmin)
export const whatsAppDomain = createWhatsAppDomain(supabaseAdmin)