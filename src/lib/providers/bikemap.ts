import { getFormatFromFilename, MAX_FILE_SIZE } from "~/lib/routeFormats";
import { ProviderError, type ProviderRoute, type RouteProvider } from "~/lib/providers/types";

const FETCH_TIMEOUT_MS = 30_000;

/** Fetches GPX files from a configurable URL template containing `{id}`. */
export class BikemapProvider implements RouteProvider {
  constructor(private urlTemplate: string | undefined) {}

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
