import { getFormatFromFilename, MAX_FILE_SIZE } from "~/lib/routeFormats";
import {
  ProviderError,
  type ProviderRoute,
  type ProviderUser,
  type RouteInfo,
  type RoutesListResult,
  type RouteProvider,
} from "~/lib/providers/types";

const FETCH_TIMEOUT_MS = 30_000;

/** Fetches GPX files from a configurable URL template containing `{id}`. */
export class BikemapProvider implements RouteProvider {
  readonly baseUrl = "https://bikemap.io";
  readonly apiUrl = "https://api.bikemap.io";

  constructor(private urlTemplate: string | undefined) {}

  async getUserInfo(accessToken: string): Promise<ProviderUser> {
    throw new ProviderError("Bikemap user profile retrieval is not supported", "not_supported");
  }

  async listRoutes(accessToken?: string, query?: any): Promise<RoutesListResult> {
    throw new ProviderError("Bikemap route listing is not supported", "not_supported");
  }

  async getRouteInfo(routeId: string, accessToken?: string): Promise<RouteInfo> {
    throw new ProviderError("Bikemap route info retrieval is not supported", "not_supported");
  }

  async fetchRoute(sourceRouteId: string): Promise<ProviderRoute> {
    if (!this.urlTemplate) {
      throw new ProviderError("Bikemap provider is not configured (BIKEMAP_GPX_URL_TEMPLATE)");
    }

    const url = this.urlTemplate.replace("{id}", encodeURIComponent(sourceRouteId));

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      throw new ProviderError(`Failed to reach Bikemap: ${msg}`);
    }

    if (response.status === 404) {
      throw new ProviderError(`Route ${sourceRouteId} not found on Bikemap`, "not_found");
    }
    if (!response.ok) {
      throw new ProviderError(`Bikemap responded with ${response.status} ${response.statusText}`);
    }

    const declaredSize = Number(response.headers.get("content-length"));
    if (declaredSize > MAX_FILE_SIZE) {
      throw new ProviderError("Route file from Bikemap is too large");
    }

    const file = Buffer.from(await response.arrayBuffer());
    if (file.length > MAX_FILE_SIZE) {
      throw new ProviderError("Route file from Bikemap is too large");
    }

    const filename = filenameFromResponse(response) ?? `${sourceRouteId}.gpx`;
    if (!getFormatFromFilename(filename)) {
      throw new ProviderError(`Unsupported file format from Bikemap: ${filename}`);
    }

    return { file, filename };
  }
}

function filenameFromResponse(response: Response): string | undefined {
  const disposition = response.headers.get("content-disposition");
  const raw = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  // Drop any path components a server might include
  return raw?.split(/[\\/]/).pop() || undefined;
}
