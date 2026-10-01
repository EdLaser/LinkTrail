/** Represents a user profile from the provider platform */
export interface ProviderUser {
  id: string;
  name: string;
  email?: string;
  bio?: string;
  avatar?: string;
  [key: string]: unknown; // Allow provider-specific fields
}

/** Represents route metadata from the provider */
export interface RouteInfo {
  id: string;
  name: string;
  description?: string;
  distance?: number; // in kilometers or miles
  elevation?: number; // in meters or feet
  difficulty?: string;
  author?: string;
  dateCreated?: Date;
  url?: string; // link to route on provider's platform
  [key: string]: unknown; // Allow provider-specific fields
}

/** Query parameters for listing routes */
export interface RouteListQuery {
  search?: string;
  limit?: number;
  offset?: number;
  [key: string]: unknown; // Allow provider-specific query params
}

/** Paginated result for route listings */
export interface RoutesListResult {
  routes: RouteInfo[];
  totalCount: number;
  hasMore: boolean;
}

export interface ProviderRoute {
  file: Buffer;
  filename: string;
  name?: string;
  description?: string;
}

export interface RouteProvider {
  baseUrl: string;
  apiUrl: string;
  /** Retrieves the authenticated user's profile from the provider. */
  getUserInfo(accessToken: string): Promise<ProviderUser>;
  /** Lists routes, optionally filtered by query. Requires accessToken for user-specific routes; optional for public discovery. */
  listRoutes(accessToken?: string, query?: RouteListQuery): Promise<RoutesListResult>;
  /** Retrieves metadata about a specific route. Requires accessToken if route is private; optional for public routes. */
  getRouteInfo(routeId: string, accessToken?: string): Promise<RouteInfo>;
  /** Downloads a route by the provider's own ID; throws ProviderError on failure. */
  fetchRoute(sourceRouteId: string): Promise<ProviderRoute>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public kind: "not_found" | "failed" | "not_supported" = "failed",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
