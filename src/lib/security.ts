import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";

/**
 * Configures CSRF protection middleware.
 * Validates that state-mutating requests (POST/PUT/DELETE/PATCH) include a valid CSRF token.
 * Uses origin and Sec-Fetch-Site header validation.
 */
export const csrfMiddleware = () =>
  csrf({
    origin: (origin: string): boolean => {
      // Allow localhost for development
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return true;
      }
      // Allow configured production origins (can be extended with env vars)
      // For now, restrict to localhost only
      return false;
    },
  });

/**
 * Configures security headers middleware.
 * Applies defense-in-depth headers including:
 * - Strict-Transport-Security (HSTS)
 * - X-Content-Type-Options (prevent MIME-type sniffing)
 * - X-Frame-Options (prevent clickjacking)
 * - Content-Security-Policy (restrict resource loading)
 * - X-XSS-Protection (legacy XSS protection)
 */
export const securityHeadersMiddleware = () =>
  secureHeaders({
    // Content Security Policy: restrict where resources can be loaded from
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
    // Strict-Transport-Security: enforce HTTPS for 1 year
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
    // X-Frame-Options: prevent clickjacking by disallowing framing
    xFrameOptions: "DENY",
    // X-Content-Type-Options: prevent MIME-type sniffing
    xContentTypeOptions: "nosniff",
    // X-XSS-Protection: enable XSS protection (legacy, but still helpful)
    xXssProtection: "1; mode=block",
  });
