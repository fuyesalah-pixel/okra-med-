export async function audit(params: { tenantId?: string; actorId?: string; action: string; entityType: string; entityId?: string; before?: unknown; after?: unknown; ip?: string; userAgent?: string }) {
  try {
    // Insert into platform_audit_log or tenant_audit_log based on tenantId presence.
    // Implementation wired when db client is available in request context.
    console.log("AUDIT", params);
  } catch { /* never throw */ }
}
