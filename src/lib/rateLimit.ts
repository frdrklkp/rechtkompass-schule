/**
 * Einfacher In-Memory-Rate-Limiter für öffentliche (unauthentifizierte)
 * /api/*-Routen mit echtem Abuse-Potenzial (z.B. E-Mail-Versand über den
 * eigenen Resend-Account, siehe send-case-document-email.ts - Fund:
 * Code-Audit 12.08.2026, "offener Spam-Vektor").
 *
 * Bewusst in-memory (kein Redis o.ä.) - passend zum bestehenden Muster der
 * In-Memory-Telemetrie in diesem Projekt. Zurückgesetzt bei jedem
 * Prozess-Neustart und nicht über mehrere Server-Instanzen hinweg geteilt;
 * für die aktuelle Single-Instance-Pilotphase ausreichend, für echten
 * Mehrinstanzbetrieb müsste dies auf einen gemeinsamen Store (Redis)
 * umgestellt werden.
 */
type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();
let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const STALE_BUCKET_MS = 24 * 60 * 60 * 1000;

/** Extrahiert die Client-IP aus Standard-Proxy-Headern, sonst Fallback. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Alte Buckets aufräumen, damit die Map nicht unbegrenzt wächst.
 *
 * Fund 2026-08-24 (Cloudflare Workers Deployment): ein modulweiter
 * `setInterval(...)` beim Laden dieses Moduls verletzt Workers' Verbot von
 * asynchronen Operationen im globalen Scope ("Disallowed operation called
 * within global scope") UND wäre im zustandslosen Worker-Ausführungsmodell
 * ohnehin nicht zuverlässig persistent. Stattdessen: opportunistisches
 * Aufräumen bei jedem Aufruf von checkRateLimit(), gedrosselt auf höchstens
 * einmal pro Stunde - läuft ausschließlich innerhalb eines echten
 * Request-Handlers.
 */
function cleanupStaleBuckets(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > STALE_BUCKET_MS) buckets.delete(key);
  }
}

/**
 * Prüft und verbucht einen Versuch. Gibt `true` zurück, wenn erlaubt,
 * `false` wenn das Limit im aktuellen Zeitfenster erreicht ist.
 */
export function checkRateLimit(key: string, opts: { max: number; windowMs: number }): boolean {
  const now = Date.now();
  cleanupStaleBuckets(now);
  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart >= opts.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (existing.count >= opts.max) return false;
  existing.count += 1;
  return true;
}
