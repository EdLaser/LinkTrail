/**
 * TypeScript types for Hammerhead API responses and payloads.
 * Derived from official Hammerhead Developer API spec.
 * Reference: https://api.hammerhead.io/v1/docs
 */

// ============================================================================
// OAuth & Authentication
// ============================================================================

export interface TokenRequest {
  client_id: string
  client_secret: string
  grant_type: 'authorization_code' | 'refresh_token'
  code?: string
  refresh_token?: string
  redirect_uri?: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number // seconds
  token_type: 'Bearer'
  // Hammerhead's ID for the authorized user
  user_id: string
}

export interface AuthorizeParams {
  client_id: string
  redirect_uri: string
  response_type: 'code'
  scope: string
  state: string
}

// ============================================================================
// Routes
// ============================================================================

export interface RouteSummary {
  id: string
  name: string
  createdAt: string
  // Distance in meters
  distance: number
  // Elevation gain in meters
  gain: number
}

export interface Route extends RouteSummary {
  updatedAt: string
  // Encoded polyline
  polyline: string
}

export interface Pagination {
  totalItems: number
  totalPages: number
  perPage: number
  currentPage: number
}

export interface RoutesListResponse extends Pagination {
  data: RouteSummary[]
}

// ============================================================================
// Routes - File Upload Payloads
// ============================================================================

// POST /routes/file and PUT /routes/{id}/file take a multipart `file` field and return the route
export type RouteFileUploadResponse = Route

// ============================================================================
// Webhooks
// ============================================================================

export interface WebhookSignatureHeader {
  headerName: 'X-Hmac-Signature'
  algorithm: 'HMAC-SHA256'
}

export interface ActivityWebhook {
  activityId: string
  userId: string
}

export type WebhookPayload = ActivityWebhook

// ============================================================================
// Error Responses
// ============================================================================

export interface ErrorResponse {
  error: string
  error_description?: string
  code?: string
  status?: number
}

// ============================================================================
// Scopes (OAuth)
// ============================================================================

export type HammerheadScope = 'activity:read' | 'route:read' | 'route:write' | 'workout:write' | 'metrics:write'

export const HAMMERHEAD_SCOPES = {
  ACTIVITY_READ: 'activity:read' as const,
  ROUTE_READ: 'route:read' as const,
  ROUTE_WRITE: 'route:write' as const,
  WORKOUT_WRITE: 'workout:write' as const,
  METRICS_WRITE: 'metrics:write' as const,
}
