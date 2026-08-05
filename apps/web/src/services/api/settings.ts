import { apiClient } from './client';
import type { SiteSettings } from '@gaming-hub/shared';

export async function fetchPublicSettings(): Promise<Partial<SiteSettings>> {
  return apiClient.get<Partial<SiteSettings>>('/settings');
}
