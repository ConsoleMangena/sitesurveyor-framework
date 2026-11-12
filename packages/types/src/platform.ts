/**
 * Core platform targets supported by SiteSurveyor.
 */
export type PlatformTarget = 'web' | 'desktop' | 'mobile';

/**
 * Deep link configuration for native shells.
 */
export interface DeepLinkConfig {
  scheme: string;
  prefix: string;
}

export const DEFAULT_DEEP_LINK_SCHEME = 'sitesurveyor';
export const DEFAULT_DEEP_LINK_PREFIX = `${DEFAULT_DEEP_LINK_SCHEME}://app`;

