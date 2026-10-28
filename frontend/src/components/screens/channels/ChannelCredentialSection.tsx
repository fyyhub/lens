import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ListPlus,
  Plus,
  RefreshCcw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { apiRequest, getApiErrorMessage } from "@/lib/api/client";
import type { SiteCredential } from "@/lib/api/sites";
import { cn } from "@/lib/classNames";
import {
  type AggregatedCredentialHealth,
  type BatchTestCredentialFailure,
  formatCredentialCooldownSummary,
} from "@/lib/credentialHealth";
import { BatchCredentialDialog } from "./BatchCredentialDialog";
import { credentialIndexLabel, emptyCredential } from "./channelModels";
import type {
  FormBaseUrl,
  FormCredential,
  FormProtocolConfig,
  Locale,
} from "./channelTypes";
import type { CredentialBatchDraft } from "./credentialBatchParse";

type Props = {
  baseUrls: FormBaseUrl[];
  credentials: FormCredential[];
  protocolConfigs: FormProtocolConfig[];
  siteId: string | null;
  canSyncRates: boolean;
  credentialHealthById: ReadonlyMap<string, AggregatedCredentialHealth>;
  batchTestFailures: ReadonlyMap<string, BatchTestCredentialFailure>;
  locale: Locale;
  onSyncingChange: (isSyncing: boolean) => void;
  onAdd: (credential: FormCredential) => void;
  onAddMany: (credentials: FormCredential[]) => void;
  onUpdate: (credentialId: string, patch: Partial<FormCredential>) => void;
  onRemove: (index: number) => void;
  onRemoveCredentials: (credentialIds: string[]) => void;
};

const CLEARED_RATE_STATUS = {
  rate_multiplier: null,
  rate_observed_at: null,
  rate_last_synced_at: null,
  rate_last_error: "",
};

// Long key lists (typical after a batch add) stay collapsed so the editor
// dialog does not grow into a page of its own.
const COLLAPSED_CREDENTIAL_LIMIT = 5;

/** Renders editable channel credentials. */
export function ChannelCredentialSection({
  baseUrls,
  credentials,
  protocolConfigs,
  siteId,
  canSyncRates,
  credentialHealthById,
  batchTestFailures,
  locale,
  onSyncingChange,
  onAdd,
  onAddMany,
  onUpdate,
  onRemove,
  onRemoveCredentials,
}: Props) {
  const queryClient = useQueryClient();
  const [syncingCredentialId, setSyncingCredentialId] = useState<string | null>(
    null,
  );
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isListExpanded, setIsListExpanded] = useState(false);
  const isCollapsible = credentials.length > COLLAPSED_CREDENTIAL_LIMIT;
  const indexedCredentials = credentials.map((credential, index) => {
    const health = credentialHealthById.get(credential.id);
    const testFailure = batchTestFailures.get(credential.id);
    const runtimeIssue =
      health && !health.available
        ? {
            summary: formatCredentialCooldownSummary(health, locale),
            detail:
              health.last_error ||
              formatCredentialCooldownSummary(health, locale),
          }
        : null;
    const issue =
      runtimeIssue ??
      (testFailure
        ? {
            summary: locale === "zh-CN" ? "测试失败" : "Test failed",
            detail: testFailure.message,
          }
        : null);
    return { credential, index, issue };
  });
  const failedEntries = indexedCredentials.filter((entry) => entry.issue);
  // Keep failed credentials visible even when the list is collapsed so failed
  // keys beyond the first 5 are immediately discoverable.
  const visibleEntries =
    isCollapsible && !isListExpanded
      ? indexedCredentials.filter(
          (entry, idx) => idx < COLLAPSED_CREDENTIAL_LIMIT || entry.issue,
        )
      : indexedCredentials;

  function removeFailedCredentials() {
    if (!failedEntries.length) return;
    if (credentials.length <= 1) {
      toast.error(
        locale === "zh-CN"
          ? "渠道至少需要保留 1 个密钥"
          : "A channel must retain at least 1 API key",
      );
      return;
    }
    const idsToRemove = failedEntries.map((entry) => entry.credential.id);
    const willRetainFirst = idsToRemove.length >= credentials.length;
    const removedCount = willRetainFirst
      ? credentials.length - 1
      : idsToRemove.length;
    onRemoveCredentials(idsToRemove);
    toast.success(
      willRetainFirst
        ? locale === "zh-CN"
          ? `已批量移除 ${removedCount} 个失效密钥（已保留第 1 个密钥槽位供替换，保存渠道后生效）`
          : `Removed ${removedCount} failed key(s) (kept 1 key slot; save channel to apply)`
        : locale === "zh-CN"
          ? `已批量移除 ${removedCount} 个失效密钥（保存渠道后生效）`
          : `Removed ${removedCount} failed key(s) (save channel to apply)`,
    );
  }

  function addCredentialBatch(drafts: CredentialBatchDraft[]) {
    onAddMany(
      drafts.map((draft) => ({
        ...emptyCredential(),
        name: draft.name,
        api_key: draft.apiKey,
      })),
    );
    const keyLabel =
      drafts.length === 1
        ? locale === "zh-CN"
          ? "1 个密钥"
          : "1 key"
        : locale === "zh-CN"
          ? `${drafts.length} 个密钥`
          : `${drafts.length} keys`;
    toast.success(
      protocolConfigs.length
        ? locale === "zh-CN"
          ? `已添加 ${keyLabel}，并已应用到协议配置的现有模型`
          : `Added ${keyLabel} and applied them to existing protocol-config models`
        : locale === "zh-CN"
          ? `已添加 ${keyLabel}`
          : `Added ${keyLabel}`,
    );
  }

  async function syncRate(credential: FormCredential) {
    if (!siteId) return;
    setSyncingCredentialId(credential.id);
    onSyncingChange(true);
    try {
      const result = await apiRequest<SiteCredential>(
        `/admin/sites/${encodeURIComponent(siteId)}/credentials/${encodeURIComponent(credential.id)}/rate-sync`,
        { method: "POST" },
      );
      onUpdate(credential.id, {
        rate_multiplier: result.rate_multiplier,
        rate_observed_at: result.rate_observed_at,
        rate_last_synced_at: result.rate_last_synced_at,
        rate_last_error: result.rate_last_error,
      });
      await queryClient.invalidateQueries({ queryKey: ["sites"] });
      toast.success(
        locale === "zh-CN" ? "凭据倍率已同步" : "Credential rate synced",
      );
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        locale === "zh-CN"
          ? "同步凭据倍率失败"
          : "Failed to sync credential rate",
      );
      onUpdate(credential.id, { rate_last_error: message });
      await queryClient.invalidateQueries({ queryKey: ["sites"] });
      toast.error(message);
    } finally {
      setSyncingCredentialId(null);
      onSyncingChange(false);
    }
  }

  return (
    <section className="grid gap-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium text-foreground">
            {locale === "zh-CN" ? "密钥" : "API Keys"}
          </div>
          {failedEntries.length > 0 ? (
            <Badge variant="destructive" className="gap-1">
              <TriangleAlert className="size-3" />
              {locale === "zh-CN"
                ? `${failedEntries.length} 个失效密钥`
                : `${failedEntries.length} failed key(s)`}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {failedEntries.length > 0 ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={credentials.length <= 1}
              onClick={removeFailedCredentials}
            >
              <Trash2 data-icon="inline-start" />
              {locale === "zh-CN"
                ? `批量移除失效 (${failedEntries.length})`
                : `Remove failed (${failedEntries.length})`}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsBatchDialogOpen(true)}
          >
            <ListPlus data-icon="inline-start" />
            {locale === "zh-CN" ? "批量添加" : "Batch add"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAdd(emptyCredential())}
          >
            <Plus data-icon="inline-start" />
            {locale === "zh-CN" ? "添加" : "Add"}
          </Button>
        </div>
      </div>
      <FieldGroup className="gap-3">
        {visibleEntries.map(({ credential, index, issue }) => {
          const hasIssue = Boolean(issue);
          const availableProtocolConfigs = protocolConfigs.filter(
            (config) =>
              config.enabled &&
              config.credential_ids.includes(credential.id) &&
              baseUrls.some(
                (baseUrl) =>
                  baseUrl.id === config.base_url_id && baseUrl.enabled,
              ),
          );
          const hasAvailableRateConfig = availableProtocolConfigs.some(
            (config) => config.id === credential.rate_protocol_config_id,
          );
          return (
            <div
              key={credential.id}
              className={cn(
                "grid min-w-0 gap-3 border-b pb-4 last:border-b-0 last:pb-0",
                hasIssue &&
                  "rounded-lg border border-destructive/40 bg-destructive/5 p-3 last:border-b last:pb-3",
              )}
            >
              <FieldGroup className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1.65fr)_minmax(0,0.85fr)_minmax(7rem,0.8fr)_32px_32px] md:items-end">
                <Field>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FieldLabel>
                      {credentialIndexLabel(index, locale)}
                    </FieldLabel>
                    {issue ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="destructive"
                            className="px-1.5 py-0 text-[10px]"
                            tabIndex={0}
                          >
                            {issue.summary}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          align="start"
                          className="max-w-sm"
                        >
                          {issue.detail}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                  <Input
                    className="w-full min-w-0"
                    value={credential.api_key}
                    onChange={(event) =>
                      onUpdate(credential.id, { api_key: event.target.value })
                    }
                    placeholder="sk-..."
                  />
                </Field>
                <Field>
                  <FieldLabel>
                    {locale === "zh-CN" ? "备注" : "Remark"}
                  </FieldLabel>
                  <Input
                    className="w-full min-w-0"
                    value={credential.name}
                    onChange={(event) =>
                      onUpdate(credential.id, { name: event.target.value })
                    }
                    placeholder={locale === "zh-CN" ? "备注" : "Remark"}
                  />
                </Field>
                <Field>
                  <FieldLabel>
                    {locale === "zh-CN" ? "倍率来源" : "Rate source"}
                  </FieldLabel>
                  <Select
                    value={credential.rate_source}
                    onValueChange={(value) =>
                      onUpdate(credential.id, {
                        rate_source: value as FormCredential["rate_source"],
                        rate_protocol_config_id:
                          value === "none"
                            ? ""
                            : credential.rate_protocol_config_id,
                        rate_group:
                          value === "newapi" ? credential.rate_group : "",
                        ...CLEARED_RATE_STATUS,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">
                          {locale === "zh-CN" ? "关闭" : "Disabled"}
                        </SelectItem>
                        <SelectItem value="sub2api">Sub2API</SelectItem>
                        <SelectItem value="newapi">NewAPI</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex size-8 items-center justify-center">
                  <Switch
                    checked={credential.enabled}
                    onCheckedChange={(checked) =>
                      onUpdate(credential.id, { enabled: checked })
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  disabled={credentials.length <= 1}
                  aria-label={
                    locale === "zh-CN" ? "删除密钥" : "Remove API key"
                  }
                  title={locale === "zh-CN" ? "删除密钥" : "Remove API key"}
                  onClick={() => onRemove(index)}
                >
                  <X />
                </Button>
              </FieldGroup>
              {issue ? (
                <div
                  className="truncate text-xs text-destructive"
                  title={issue.detail}
                >
                  {locale === "zh-CN" ? "最近报错：" : "Last error: "}
                  {issue.detail}
                </div>
              ) : null}
              {credential.rate_source !== "none" ? (
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  <Field>
                    <FieldLabel>
                      {locale === "zh-CN" ? "请求配置" : "Request config"}
                    </FieldLabel>
                    <Select
                      value={credential.rate_protocol_config_id}
                      onValueChange={(value) =>
                        onUpdate(credential.id, {
                          rate_protocol_config_id: value,
                          ...CLEARED_RATE_STATUS,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            locale === "zh-CN" ? "选择配置" : "Select config"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {availableProtocolConfigs.map(
                            (config, configIndex) => (
                              <SelectItem key={config.id} value={config.id}>
                                {config.name ||
                                  (locale === "zh-CN"
                                    ? `配置 ${configIndex + 1}`
                                    : `Config ${configIndex + 1}`)}
                              </SelectItem>
                            ),
                          )}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  {credential.rate_source === "newapi" ? (
                    <Field>
                      <FieldLabel>
                        {locale === "zh-CN" ? "NewAPI 分组" : "NewAPI group"}
                      </FieldLabel>
                      <Input
                        value={credential.rate_group}
                        onChange={(event) =>
                          onUpdate(credential.id, {
                            rate_group: event.target.value,
                            ...CLEARED_RATE_STATUS,
                          })
                        }
                        placeholder="default"
                      />
                    </Field>
                  ) : null}
                </div>
              ) : null}
              {credential.rate_source !== "none" ? (
                <div className="flex min-h-8 flex-wrap items-center gap-2">
                  {credential.rate_multiplier !== null ? (
                    <Badge variant="secondary">
                      {credential.rate_source === "newapi"
                        ? locale === "zh-CN"
                          ? "参考倍率"
                          : "Reference rate"
                        : locale === "zh-CN"
                          ? "有效倍率"
                          : "Effective rate"}
                      : {credential.rate_multiplier}x
                    </Badge>
                  ) : null}
                  {credential.rate_last_synced_at ? (
                    <span className="text-xs text-muted-foreground">
                      {new Date(credential.rate_last_synced_at).toLocaleString(
                        locale,
                      )}
                    </span>
                  ) : null}
                  {credential.rate_last_error ? (
                    <span
                      className="min-w-0 flex-1 truncate text-xs text-destructive"
                      title={credential.rate_last_error}
                    >
                      {credential.rate_last_error}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    disabled={
                      !canSyncRates ||
                      !credential.enabled ||
                      !hasAvailableRateConfig ||
                      (credential.rate_source === "newapi" &&
                        !credential.rate_group.trim())
                    }
                    onClick={() => void syncRate(credential)}
                  >
                    <RefreshCcw
                      data-icon="inline-start"
                      className={
                        syncingCredentialId === credential.id
                          ? "animate-spin"
                          : undefined
                      }
                    />
                    {locale === "zh-CN" ? "同步倍率" : "Sync rate"}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </FieldGroup>
      {isCollapsible ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start text-muted-foreground"
          onClick={() => setIsListExpanded((current) => !current)}
        >
          {isListExpanded ? (
            <ChevronUp data-icon="inline-start" />
          ) : (
            <ChevronDown data-icon="inline-start" />
          )}
          {isListExpanded
            ? locale === "zh-CN"
              ? "收起"
              : "Show less"
            : locale === "zh-CN"
              ? `展开全部（共 ${credentials.length} 个）`
              : `Show all (${credentials.length})`}
        </Button>
      ) : null}
      <BatchCredentialDialog
        open={isBatchDialogOpen}
        locale={locale}
        existingApiKeys={credentials.map((credential) => credential.api_key)}
        onOpenChange={setIsBatchDialogOpen}
        onConfirm={addCredentialBatch}
      />
    </section>
  );
}
