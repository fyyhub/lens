import type { Site, SiteProtocolConfig } from "@/lib/api/sites";

/** Builds a compact summary of a site's configured base URLs. */
export function siteEndpointSummary(site: Site, locale: string = "zh-CN") {
  const enabled = site.base_urls.filter((item) => item.enabled);
  const firstUrl = enabled[0]?.url || site.base_urls[0]?.url || "";
  const extraCount =
    enabled.length > 1
      ? enabled.length - 1
      : site.base_urls.length > 1
        ? site.base_urls.length - 1
        : 0;
  if (extraCount > 0) {
    const suffix =
      locale === "zh-CN" ? ` + ${extraCount}个地址` : ` + ${extraCount} more`;
    return firstUrl + suffix;
  }
  return firstUrl;
}

/** Counts enabled model entries across a site's protocol configurations. */
export function siteModelCount(site: Site) {
  return site.protocols.reduce(
    (total, protocolConfig) =>
      total + protocolConfig.models.filter((model) => model.enabled).length,
    0,
  );
}

/** Reports whether a protocol configuration is enabled at every owning level. */
export function isSiteProtocolConfigEnabled(
  site: Site,
  protocolConfig: SiteProtocolConfig,
) {
  return site.enabled && protocolConfig.enabled;
}

/**
 * Common public suffixes that need a third label to form a registrable
 * domain; the full Public Suffix List is overkill for favicon lookup.
 */
const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  "com.cn",
  "net.cn",
  "org.cn",
  "gov.cn",
  "edu.cn",
  "ac.cn",
  "com.hk",
  "com.tw",
  "com.sg",
  "co.jp",
  "ne.jp",
  "or.jp",
  "ac.jp",
  "co.kr",
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "me.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "com.mx",
  "com.ar",
  "com.my",
  "com.ph",
  "com.vn",
  "com.tr",
  "com.sa",
  "co.in",
  "net.in",
  "org.in",
  "ac.in",
  "co.za",
]);

/**
 * Parses the registrable domain (eTLD+1) from a hostname so subdomains such
 * as `api.example.com` resolve to `example.com`. Returns null for IPs and
 * bare hosts such as `localhost`.
 */
function parseRegistrableDomain(hostname: string): string | null {
  const normalized = hostname.toLowerCase().replace(/\.+$/, "");
  if (normalized.includes(":")) {
    return null;
  }
  const labels = normalized.split(".");
  if (labels.length < 2 || labels.every((label) => /^\d+$/.test(label))) {
    return null;
  }
  const suffixLength = MULTI_LABEL_PUBLIC_SUFFIXES.has(
    labels.slice(-2).join("."),
  )
    ? 3
    : 2;
  return labels.slice(-suffixLength).join(".");
}

/**
 * Builds ordered favicon candidates for a valid site URL, preferring the
 * registrable domain because most channel endpoints are subdomains without
 * their own favicon.
 */
export function getSiteFaviconCandidates(url: string) {
  try {
    const parsed = new URL(url);
    const domain = parseRegistrableDomain(parsed.hostname);
    const candidates = domain
      ? [
          `https://${domain}/favicon.ico`,
          `https://www.${domain}/favicon.ico`,
          `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
          `${parsed.origin}/favicon.ico`,
        ]
      : [`${parsed.origin}/favicon.ico`];
    return [...new Set(candidates)];
  } catch {
    return [];
  }
}
