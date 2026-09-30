import type { AppConfig } from "~/lib/config";
import { BikemapProvider } from "~/lib/providers/bikemap";
import type { RouteProvider } from "~/lib/providers/types";

// Add a provider by adding its ID here and an implementation in createProviders
export const PROVIDER_IDS = ["bikemap"] as const;

export type RouteProviderId = (typeof PROVIDER_IDS)[number];

export interface RouteSource {
  provider: RouteProviderId;
  routeId: string;
}

export function createProviders(config: AppConfig): Record<RouteProviderId, RouteProvider> {
  return {
    bikemap: new BikemapProvider(config.bikemapGpxUrlTemplate),
  };
}
