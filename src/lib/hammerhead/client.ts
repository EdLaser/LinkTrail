import type { AppConfig } from "~/lib/config.ts";
import type {
  TokenResponse,
  TokenRequest,
  RouteSummary,
  RoutesListResponse,
  RouteFileUploadResponse,
  HammerheadScope,
} from "~/lib/hammerhead/types.ts";

/**
 * Custom error class for Hammerhead API errors
 */
export class HammerheadApiError extends Error {
  constructor(
    public statusCode: number,
    public statusText: string,
    public responseBody: string,
  ) {
    super(`Hammerhead API Error: ${statusCode} ${statusText}`);
    this.name = "HammerheadApiError";
  }
}

/**
 * Hammerhead API client for OAuth and route operations
 */
export class HammerheadClient {
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(config: AppConfig) {
    this.baseUrl = config.hammerheadApiBaseUrl;
    this.clientId = config.hammerheadClientId;
    this.clientSecret = config.hammerheadClientSecret;
    this.redirectUri = config.hammerheadRedirectUri;
  }

  // ========================================================================
  // OAuth Methods
  // ========================================================================

  /**
   * Build the OAuth authorize URL for redirecting user to Hammerhead
   */
  buildAuthorizeUrl(state: string, scopes: HammerheadScope[]): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      state,
    });

    return `${this.baseUrl}/auth/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: this.redirectUri,
    });

    return this.post<TokenResponse>(`/auth/oauth/token`, body.toString(), {
      "Content-Type": "application/x-www-form-urlencoded",
    });
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    return this.post<TokenResponse>(`/auth/oauth/token`, body.toString(), {
      "Content-Type": "application/x-www-form-urlencoded",
    });
  }

  /**
   * Deauthorize: revoke access for a user and clean up their data
   */
  async deauthorize(accessToken: string): Promise<void> {
    await this.post<void>(`/auth/oauth/deauthorize`, "{}", {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    });
  }

  // ========================================================================
  // Route Methods
  // ========================================================================

  /**
   * Create a route by uploading a GPX/FIT/TCX/KML/KMZ file
   * POST /routes/file
   */
  async createRoute(
    accessToken: string,
    fileBuffer: Buffer,
    filename: string,
    name?: string,
    description?: string,
  ): Promise<RouteFileUploadResponse> {
    const formData = new FormData();
    formData.append("file", new Blob([fileBuffer]), filename);
    if (name) formData.append("name", name);
    if (description) formData.append("description", description);

    return this.post<RouteFileUploadResponse>(`/routes/file`, formData, {
      Authorization: `Bearer ${accessToken}`,
      // Don't set Content-Type; fetch will set it with boundary
    });
  }

  /**
   * Update an existing route by uploading a new file
   * PUT /routes/{routeId}/file
   */
  async updateRoute(
    accessToken: string,
    routeId: string,
    fileBuffer: Buffer,
    filename: string,
    name?: string,
    description?: string,
  ): Promise<RouteFileUploadResponse> {
    const formData = new FormData();
    formData.append("file", new Blob([fileBuffer]), filename);
    if (name) formData.append("name", name);
    if (description) formData.append("description", description);

    return this.put<RouteFileUploadResponse>(`/routes/${routeId}/file`, formData, {
      Authorization: `Bearer ${accessToken}`,
    });
  }

  /**
   * List all routes for the authenticated user
   * GET /routes
   */
  async listRoutes(
    accessToken: string,
    page: number = 1,
    perPage: number = 20,
  ): Promise<RoutesListResponse> {
    const query = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });

    return this.get<RoutesListResponse>(`/routes?${query.toString()}`, {
      Authorization: `Bearer ${accessToken}`,
    });
  }

  /**
   * Delete a route
   * DELETE /routes/{routeId}
   */
  async deleteRoute(accessToken: string, routeId: string): Promise<void> {
    await this.delete(`/routes/${routeId}`, {
      Authorization: `Bearer ${accessToken}`,
    });
  }

  // ========================================================================
  // HTTP Methods (Private)
  // ========================================================================

  private async get<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        ...headers,
      },
    });

    return this.handleResponse<T>(response);
  }

  private async post<T>(
    path: string,
    body: string | FormData,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body,
    });

    return this.handleResponse<T>(response);
  }

  private async put<T>(
    path: string,
    body: string | FormData,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers,
      body,
    });

    return this.handleResponse<T>(response);
  }

  private async delete(path: string, headers: Record<string, string> = {}): Promise<void> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new HammerheadApiError(response.status, response.statusText, text);
    }
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const text = await response.text();

    if (!response.ok) {
      throw new HammerheadApiError(response.status, response.statusText, text);
    }

    if (!text) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Failed to parse Hammerhead API response: ${text}`);
    }
  }
}
