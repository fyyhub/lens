import {
  ArrowLeftRight,
  ChevronDown,
  CircleHelp,
  Pencil,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { BatchModelTestOption } from "@/components/model-test/batchModelTestSession";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { ToolbarSearchInput } from "@/components/ui/ToolbarSearchInput";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import type { ProtocolKind } from "@/lib/api/protocols";
import type { Locale, TestableModelOption } from "./channelTypes";
import { SiteModelAggregateView } from "./SiteModelAggregateView";
import type { AggregatedModel } from "./useChannelQueries";

type Props = {
  locale: Locale;
  overviewModels: AggregatedModel[];
  modelTestOptionByKey: Map<string, TestableModelOption>;
  batchTestOptions: BatchModelTestOption[];
  isBatchModelTestRunning: boolean;
  testingModel: boolean;
  onOpenBatchTest: () => void;
  onUpdateModelProtocols: (modelKey: string, protocols: ProtocolKind[]) => void;
  onUpdateModelSource: (
    modelKey: string,
    source: AggregatedModel["source"],
  ) => void;
  onUpdateAllModelSources: (
    source: AggregatedModel["source"],
    modelKeys?: string[],
  ) => void;
  onOpenModelTest: (modelKey: string) => void;
  onRemoveModel: (modelKey: string) => void;
  onClearModels: () => void;
};

/** Renders aggregate channel models and their bulk actions. */
export function ChannelModelOverviewSection({
  locale,
  overviewModels,
  modelTestOptionByKey,
  batchTestOptions,
  isBatchModelTestRunning,
  testingModel,
  onOpenBatchTest,
  onUpdateModelProtocols,
  onUpdateModelSource,
  onUpdateAllModelSources,
  onOpenModelTest,
  onRemoveModel,
  onClearModels,
}: Props) {
  const [search, setSearch] = useState("");
  const lowerSearchQuery = search.trim().toLowerCase();
  const filteredModels = useMemo(() => {
    if (!lowerSearchQuery) return overviewModels;
    return overviewModels.filter(
      (model) =>
        model.modelName.toLowerCase().includes(lowerSearchQuery) ||
        model.sourceLabel.toLowerCase().includes(lowerSearchQuery),
    );
  }, [lowerSearchQuery, overviewModels]);
  const hasSearch = lowerSearchQuery.length > 0;
  const bulkModels = hasSearch ? filteredModels : overviewModels;
  const hasManualModels = bulkModels.some((model) =>
    model.members.some((member) => member.source === "manual"),
  );
  const hasSyncedModels = bulkModels.some((model) =>
    model.members.some((member) => member.source === "synced"),
  );
  const switchBulkModelSources = (source: AggregatedModel["source"]) =>
    onUpdateAllModelSources(
      source,
      hasSearch ? filteredModels.map((model) => model.key) : undefined,
    );
  const bulkSourceLabel = (source: AggregatedModel["source"]) => {
    const zhSource = source === "synced" ? "同步" : "手动";
    const enSource = source === "synced" ? "synced" : "manual";
    if (!hasSearch) {
      return locale === "zh-CN"
        ? `全部设为${zhSource}`
        : `Set all to ${enSource}`;
    }
    const count = filteredModels.length;
    return locale === "zh-CN"
      ? `将 ${count} 个搜索结果设为${zhSource}`
      : `Set ${count} ${count === 1 ? "result" : "results"} to ${enSource}`;
  };
  const sourceHelpLines =
    locale === "zh-CN"
      ? [
          "新添加的模型默认为手动，可在此逐个或批量切换为同步。",
          "手动：始终保留，不受上游变化影响。",
          "同步：跟随上游，上游下架后显示「待上游恢复」，重新上架后自动加回。",
          "搜索时，批量切换仅作用于搜索结果。",
        ]
      : [
          "New models default to Manual; switch them to Synced here, one by one or in bulk.",
          "Manual: always kept, unaffected by upstream changes.",
          "Synced: follows upstream. Shown as Awaiting upstream when removed upstream, and restored automatically when it returns.",
          "While searching, bulk switch applies only to the results.",
        ];

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex shrink-0 items-center gap-1">
            <div className="text-base font-semibold text-foreground">
              {locale === "zh-CN" ? "模型总览" : "Model Overview"}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    locale === "zh-CN" ? "模型来源说明" : "Model source details"
                  }
                >
                  <CircleHelp />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-sm">
                <div className="flex flex-col gap-1">
                  {sourceHelpLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          {overviewModels.length ? (
            <>
              <ToolbarSearchInput
                value={search}
                onChange={setSearch}
                onClear={() => setSearch("")}
                placeholder={
                  locale === "zh-CN"
                    ? "搜索模型或来源"
                    : "Search models or sources"
                }
                className="max-w-none sm:max-w-sm"
              />
              <div className="shrink-0 text-xs text-muted-foreground">
                {hasSearch
                  ? locale === "zh-CN"
                    ? `找到 ${filteredModels.length}/${overviewModels.length} 个模型`
                    : `${filteredModels.length}/${overviewModels.length} matched`
                  : locale === "zh-CN"
                    ? `共 ${overviewModels.length} 个模型`
                    : `${overviewModels.length} models`}
              </div>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onClearModels}
            disabled={!overviewModels.length}
          >
            <Trash2 data-icon="inline-start" />
            {locale === "zh-CN" ? "清空所有模型" : "Clear all models"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenBatchTest}
            disabled={
              !batchTestOptions.length ||
              isBatchModelTestRunning ||
              testingModel
            }
          >
            <RefreshCcw
              data-icon="inline-start"
              className={isBatchModelTestRunning ? "animate-spin" : undefined}
            />
            {locale === "zh-CN" ? "批量测试" : "Batch test"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!bulkModels.length}
              >
                <ArrowLeftRight data-icon="inline-start" />
                {locale === "zh-CN" ? "批量切换" : "Bulk switch"}
                <ChevronDown data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => switchBulkModelSources("manual")}
                  disabled={!hasSyncedModels}
                >
                  <Pencil />
                  {bulkSourceLabel("manual")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => switchBulkModelSources("synced")}
                  disabled={!hasManualModels}
                >
                  <RefreshCcw />
                  {bulkSourceLabel("synced")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <SiteModelAggregateView
        models={filteredModels}
        locale={locale}
        emptyLabel={
          hasSearch
            ? locale === "zh-CN"
              ? "没有匹配的模型"
              : "No matching models"
            : undefined
        }
        onChangeModelProtocols={onUpdateModelProtocols}
        onChangeModelSource={onUpdateModelSource}
        onOpenModelTest={onOpenModelTest}
        onRemoveModel={onRemoveModel}
        canTestModel={(modelKey) => modelTestOptionByKey.has(modelKey)}
        testingDisabled={testingModel || isBatchModelTestRunning}
      />
    </div>
  );
}
