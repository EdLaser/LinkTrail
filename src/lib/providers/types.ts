export interface ProviderRoute {
  file: Buffer;
  filename: string;
  name?: string;
  description?: string;
}

export interface RouteProvider {
  /** Downloads a route by the provider's own ID; throws ProviderError on failure. */
  fetchRoute(sourceRouteId: string): Promise<ProviderRoute>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public kind: "not_found" | "failed" = "failed",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
