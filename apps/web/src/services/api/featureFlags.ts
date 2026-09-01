import { apiClient } from './client';

export type FeatureFlags = Record<string, boolean>;

export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  return apiClient.get<FeatureFlags>('/feature-flags');
}
