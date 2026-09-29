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
  scope: string
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

export interface Route {
  id: string
  name: string
  description?: string
  // Distance in kilometers
  distance: number
  // Elevation gain in meters
  elevationGain: number
  // Elevation loss in meters
  elevationLoss: number
  // Minimum elevation in meters
  minElevation: number
  // Maximum elevation in meters
  maxElevation: number
  // Total duration in seconds
  duration: number
  // Route difficulty (1-5)
  difficulty?: number
  // Creation timestamp
  createdAt: string
  // Last modified timestamp
  updatedAt: string
  // User ID who created the route
  userId: string
  // Source of the route (e.g., "imported", "created")
  source?: string
  // GPX file data (base64 or URL)
  gpxUrl?: string
  // Route tracking (GPS points)
  trackPoints?: TrackPoint[]
}

export interface TrackPoint {
  latitude: number
  longitude: number
  elevation?: number
  timestamp?: string
}

export interface RouteSummary {
  id: string
  name: string
  distance: number
  elevationGain: number
  createdAt: string
  userId: string
}

export interface RoutesListResponse {
  data: RouteSummary[]
  pagination: Pagination
}

export interface Pagination {
  page: number
  perPage: number
  total: number
  totalPages: number
}

// ============================================================================
// Routes - File Upload Payloads
// ============================================================================

export interface RouteFileUploadRequest {
  file: Blob | Buffer
  filename: string
  description?: string
  name?: string
}

export interface RouteFileUploadResponse {
  id: string
  name: string
  distance: number
  elevationGain: number
  createdAt: string
  userId: string
  gpxUrl: string
}

// ============================================================================
// Webhooks
// ============================================================================

export interface WebhookSignatureHeader {
  headerName: 'X-Hmac-Signature'
  algorithm: 'HMAC-SHA256'
}

export interface ActivityWebhook {
  type: 'activity'
  timestamp: string
  data: {
    activityId: string
    userId: string
    routeId?: string
    startTime: string
    endTime: string
    duration: number // seconds
    distance: number // kilometers
    elevationGain: number // meters
    avgHeartRate?: number
    maxHeartRate?: number
    avgCadence?: number
    maxCadence?: number
    avgPower?: number
    maxPower?: number
    avgSpeed: number // km/h
    maxSpeed: number // km/h
  }
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
