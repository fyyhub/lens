import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiRequest } from "@/lib/api/client";
import type { RouterSnapshot } from "@/lib/api/sites";
import { formatCredentialDisplayName } from "@/lib/credentialLabels";

export type AggregatedCredentialHealth = {
  credential_id: string;
  credential_name: string;
  credential_number: number;
  site_id: string;
  channel_name: string;
  available: boolean;
  cooldown_remaining_seconds: number;
  consecutive_failures: number;
  last_error: string | null;
  last_error_category: string | null;
};

export type SiteRuntimeCredentialSummary = {
  site_id: string;
  channel_name: string;
  total_key_count: number;
  available_key_count: number;
  cooled_key_count: number;
  cooled_credentials: AggregatedCredentialHealth[];
  all_credentials: AggregatedCredentialHealth[];
  credentials_by_id: Map<string, AggregatedCredentialHealth>;
};

export type CredentialHealthIndex = {
  byCredentialId: Map<string, AggregatedCredentialHealth>;
  bySiteId: Map<string, SiteRuntimeCredentialSummary>;
  byChannelName: Map<string, SiteRuntimeCredentialSummary>;
};

/** Aggregate runtime credential cooldown states across protocol channels. */
export function buildCredentialHealthIndex(
  snapshot?: RouterSnapshot | null,
): CredentialHealthIndex {
  const byCredentialId = new Map<string, AggregatedCredentialHealth>();
  const siteCredentialsMap = new Map<
    string,
    {
      site_id: string;
      channel_name: string;
      credentials: Map<string, AggregatedCredentialHealth>;
    }
  >();

  for (const channelHealth of snapshot?.health ?? []) {
    const siteId = (channelHealth.site_id ?? "").trim();
    const channelName = (channelHealth.channel_name ?? "").trim();
    const siteGroupKey = siteId || `channel:${channelHealth.channel_id}`;

    let siteEntry = siteCredentialsMap.get(siteGroupKey);
    if (!siteEntry) {
      siteEntry = {
        site_id: siteId,
        channel_name: channelName,
        credentials: new Map(),
      };
      siteCredentialsMap.set(siteGroupKey, siteEntry);
    } else if (!siteEntry.channel_name && channelName) {
      siteEntry.channel_name = channelName;
    }

    for (const cred of channelHealth.credential_health ?? []) {
      const credId = (cred.credential_id ?? "").trim();
      if (!credId) continue;

      const isAvailable =
        cred.available && (cred.cooldown_remaining_seconds ?? 0) <= 0;
      const existing = byCredentialId.get(credId);
      const nextName =
        (cred.credential_name ?? "").trim() || existing?.credential_name || "";
      const nextNumber =
        cred.credential_number && cred.credential_number > 0
          ? cred.credential_number
          : (existing?.credential_number ?? 0);

      const candidateError =
        cred.last_error ||
        (!isAvailable ? channelHealth.last_error : null) ||
        null;
      const candidateCategory =
        cred.last_error_category ||
        (!isAvailable ? channelHealth.last_error_category : null) ||
        null;

      if (!existing) {
        const created: AggregatedCredentialHealth = {
          credential_id: credId,
          credential_name: nextName,
          credential_number: nextNumber,
          site_id: siteId,
          channel_name: channelName,
          available: isAvailable,
          cooldown_remaining_seconds: Math.max(
            cred.cooldown_remaining_seconds ?? 0,
            0,
          ),
          consecutive_failures: Math.max(cred.consecutive_failures ?? 0, 0),
          last_error: candidateError,
          last_error_category: candidateCategory,
        };
        byCredentialId.set(credId, created);
        siteEntry.credentials.set(credId, created);
        continue;
      }

      const preferNewError =
        !isAvailable &&
        (existing.available ||
          (cred.cooldown_remaining_seconds ?? 0) >=
            existing.cooldown_remaining_seconds ||
          !existing.last_error);

      const merged: AggregatedCredentialHealth = {
        credential_id: credId,
        credential_name: nextName,
        credential_number: nextNumber,
        site_id: existing.site_id || siteId,
        channel_name: existing.channel_name || channelName,
        available: existing.available && isAvailable,
        cooldown_remaining_seconds: Math.max(
          existing.cooldown_remaining_seconds,
          cred.cooldown_remaining_seconds ?? 0,
        ),
        consecutive_failures: Math.max(
          existing.consecutive_failures,
          cred.consecutive_failures ?? 0,
        ),
        last_error: preferNewError
          ? (candidateError ?? existing.last_error)
          : (existing.last_error ?? candidateError),
        last_error_category: preferNewError
          ? (candidateCategory ?? existing.last_error_category)
          : (existing.last_error_category ?? candidateCategory),
      };
      byCredentialId.set(credId, merged);
      siteEntry.credentials.set(credId, merged);
    }
  }

  const bySiteId = new Map<string, SiteRuntimeCredentialSummary>();
  const byChannelName = new Map<string, SiteRuntimeCredentialSummary>();

  for (const entry of siteCredentialsMap.values()) {
    const allCredentials = Array.from(entry.credentials.values()).sort(
      (left, right) =>
        (left.credential_number || Number.MAX_SAFE_INTEGER) -
          (right.credential_number || Number.MAX_SAFE_INTEGER) ||
        left.credential_id.localeCompare(right.credential_id),
    );
    const cooledCredentials = allCredentials.filter((item) => !item.available);
    const summary: SiteRuntimeCredentialSummary = {
      site_id: entry.site_id,
      channel_name: entry.channel_name,
      total_key_count: allCredentials.length,
      available_key_count: allCredentials.length - cooledCredentials.length,
      cooled_key_count: cooledCredentials.length,
      cooled_credentials: cooledCredentials,
      all_credentials: allCredentials,
      credentials_by_id: entry.credentials,
    };
    if (entry.site_id) {
      bySiteId.set(entry.site_id, summary);
    }
    if (entry.channel_name) {
      byChannelName.set(entry.channel_name, summary);
    }
  }

  return {
    byCredentialId,
    bySiteId,
    byChannelName,
  };
}

/** Query the runtime router snapshot and index credential health states. */
export function useRouterSnapshot(enabled = true) {
  const query = useQuery({
    queryKey: ["router-snapshot"],
    queryFn: () => apiRequest<RouterSnapshot>("/admin/routes"),
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const credentialHealthIndex = useMemo(
    () => buildCredentialHealthIndex(query.data),
    [query.data],
  );
  return {
    ...query,
    credentialHealthIndex,
  };
}

/** Format remaining cooldown seconds into a compact localized string. */
export function formatCooldownDuration(
  seconds: number,
  locale: "zh-CN" | "en-US",
): string {
  const safeSeconds = Math.max(Math.ceil(seconds), 0);
  if (safeSeconds <= 0) {
    return locale === "zh-CN" ? "即将恢复" : "recovering";
  }
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  if (hours > 0) {
    return locale === "zh-CN"
      ? `${hours}小时${minutes > 0 ? `${minutes}分` : ""}`
      : `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  }
  if (minutes > 0) {
    return locale === "zh-CN"
      ? `${minutes}分${secs > 0 ? `${secs}秒` : ""}`
      : `${minutes}m${secs > 0 ? ` ${secs}s` : ""}`;
  }
  return locale === "zh-CN" ? `${secs}秒` : `${secs}s`;
}

/** Translate an upstream error category into a short localized label. */
export function formatErrorCategoryLabel(
  category: string | null | undefined,
  locale: "zh-CN" | "en-US",
): string {
  const isZh = locale === "zh-CN";
  switch (category) {
    case "auth":
      return isZh ? "认证失败" : "Auth failed";
    case "rate_limit":
      return isZh ? "触发限流" : "Rate limited";
    case "not_found":
      return isZh ? "资源不存在" : "Not found";
    case "timeout":
      return isZh ? "请求超时" : "Timeout";
    case "network":
      return isZh ? "网络异常" : "Network error";
    case "server":
      return isZh ? "上游异常" : "Server error";
    default:
      return isZh ? "运行时冷却" : "Cooling down";
  }
}

/** Format a credential's display name with its number and remark. */
export function formatHealthCredentialLabel(
  health: Pick<
    AggregatedCredentialHealth,
    "credential_name" | "credential_number"
  >,
  locale: "zh-CN" | "en-US",
): string {
  return formatCredentialDisplayName(
    health.credential_name,
    health.credential_number || 1,
    locale,
  );
}

/** Build a single-line summary for a cooled credential. */
export function formatCredentialCooldownSummary(
  health: AggregatedCredentialHealth,
  locale: "zh-CN" | "en-US",
): string {
  const categoryLabel = formatErrorCategoryLabel(
    health.last_error_category,
    locale,
  );
  const durationLabel = formatCooldownDuration(
    health.cooldown_remaining_seconds,
    locale,
  );
  const parts = [
    categoryLabel,
    locale === "zh-CN" ? `剩余 ${durationLabel}` : `${durationLabel} remaining`,
  ];
  if (health.consecutive_failures > 1) {
    parts.push(
      locale === "zh-CN"
        ? `连续失败 ${health.consecutive_failures} 次`
        : `${health.consecutive_failures} consecutive failures`,
    );
  }
  return parts.join(" · ");
}
