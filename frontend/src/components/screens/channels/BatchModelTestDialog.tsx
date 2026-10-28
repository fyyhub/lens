import { RefreshCcw } from "lucide-react";
import type {
  BatchModelTestOption,
  BatchModelTestRow,
} from "@/components/model-test/batchModelTestSession";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { AppDialogContent, Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import type { ProtocolKind } from "@/lib/api/protocols";
import { cn } from "@/lib/classNames";
import {
  compactProtocolLabel,
  protocolBadgeClassName,
  protocolLabel,
} from "@/lib/protocols";
import { BatchModelTestResults } from "./BatchModelTestResults";
import type { Locale } from "./channelTypes";

type Props = {
  open: boolean;
  locale: Locale;
  modelTestPrompts: string[];
  batchTestPromptMode: string;
  batchTestPrompt: string;
  batchTestConcurrency: string;
  batchTestOptions: BatchModelTestOption[];
  batchTestDeselectedKeys: ReadonlySet<string>;
  batchTestRows: BatchModelTestRow[];
  isBatchModelTestRunning: boolean;
  onOpenChange: (open: boolean) => void;
  onPromptModeChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onConcurrencyChange: (value: string) => void;
  onProtocolChange: (key: string, protocol: ProtocolKind) => void;
  onToggleModel: (key: string) => void;
  onSelectAllModels: () => void;
  onClearModelSelection: () => void;
  onRetestRow: (key: string) => void;
  onRun: () => void;
};

/** Renders batch model test controls and result rows. */
export function BatchModelTestDialog({
  open,
  locale,
  modelTestPrompts,
  batchTestPromptMode,
  batchTestPrompt,
  batchTestConcurrency,
  batchTestOptions,
  batchTestDeselectedKeys,
  batchTestRows,
  isBatchModelTestRunning,
  onOpenChange,
  onPromptModeChange,
  onPromptChange,
  onConcurrencyChange,
  onProtocolChange,
  onToggleModel,
  onSelectAllModels,
  onClearModelSelection,
  onRetestRow,
  onRun,
}: Props) {
  const multiProtocolOptions = batchTestOptions.filter(
    (item) =>
      item.protocols.length > 1 && !batchTestDeselectedKeys.has(item.key),
  );
  const testableCount = batchTestOptions.length;
  const selectedOptions = batchTestOptions.filter(
    (item) => !batchTestDeselectedKeys.has(item.key),
  );
  const selectedCount = selectedOptions.length;
  const requestCount = selectedOptions.reduce(
    (total, item) => total + item.credentialCount,
    0,
  );
  const canRun =
    selectedCount > 0 &&
    Boolean(batchTestPrompt.trim()) &&
    !isBatchModelTestRunning;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <AppDialogContent
          className="max-w-4xl"
          title={locale === "zh-CN" ? "批量测试模型" : "Batch test models"}
          footer={
            <Button type="button" onClick={onRun} disabled={!canRun}>
              <RefreshCcw
                data-icon="inline-start"
                className={isBatchModelTestRunning ? "animate-spin" : undefined}
              />
              {locale === "zh-CN" ? "开始测试" : "Start test"}
            </Button>
          }
        >
          <div className="grid gap-4">
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {locale === "zh-CN"
                ? `将测试 ${selectedCount} 个模型，共 ${requestCount} 个请求（每个模型测试全部密钥）`
                : `Testing ${selectedCount} models with ${requestCount} requests (every key per model)`}
            </div>

            <section className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {locale === "zh-CN" ? "测试模型" : "Models"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {locale === "zh-CN"
                      ? `已选 ${selectedCount} / ${testableCount}`
                      : `${selectedCount} / ${testableCount} selected`}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={onSelectAllModels}
                    disabled={
                      isBatchModelTestRunning || selectedCount === testableCount
                    }
                  >
                    {locale === "zh-CN" ? "全选" : "Select all"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={onClearModelSelection}
                    disabled={isBatchModelTestRunning || selectedCount === 0}
                  >
                    {locale === "zh-CN" ? "清空" : "Clear"}
                  </Button>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border">
                {batchTestOptions.map((item, index) => {
                  const checkboxId = `batch-model-option-${index}`;
                  return (
                    <label
                      key={item.key}
                      htmlFor={checkboxId}
                      className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={!batchTestDeselectedKeys.has(item.key)}
                        onCheckedChange={() => onToggleModel(item.key)}
                        disabled={isBatchModelTestRunning}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {item.modelName}
                      </span>
                      <span className="hidden max-w-[40%] truncate text-xs text-muted-foreground sm:block">
                        {item.credentialName ||
                          (locale === "zh-CN"
                            ? `${item.credentialCount} 个密钥`
                            : `${item.credentialCount} key(s)`)}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 text-xs",
                          protocolBadgeClassName(item.selectedProtocol),
                        )}
                      >
                        {compactProtocolLabel(item.selectedProtocol)}
                      </Badge>
                    </label>
                  );
                })}
              </div>
            </section>

            <FieldGroup>
              <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                <div className="grid gap-3">
                  <Field>
                    <FieldLabel>
                      {locale === "zh-CN" ? "测试问题" : "Prompt"}
                    </FieldLabel>
                    <Select
                      value={batchTestPromptMode}
                      onValueChange={onPromptModeChange}
                      disabled={isBatchModelTestRunning}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {modelTestPrompts.map((_, index) => (
                          <SelectItem key={index} value={String(index)}>
                            {locale === "zh-CN"
                              ? `预设 ${index + 1}`
                              : `Preset ${index + 1}`}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">
                          {locale === "zh-CN" ? "自定义" : "Custom"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>
                      {locale === "zh-CN" ? "并发数" : "Concurrency"}
                    </FieldLabel>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={batchTestConcurrency}
                      onChange={(event) =>
                        onConcurrencyChange(event.target.value)
                      }
                      disabled={isBatchModelTestRunning}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel>
                    {locale === "zh-CN" ? "内容" : "Content"}
                  </FieldLabel>
                  <Textarea
                    className="min-h-24"
                    value={batchTestPrompt}
                    onChange={(event) => onPromptChange(event.target.value)}
                    disabled={isBatchModelTestRunning}
                  />
                </Field>
              </div>
            </FieldGroup>

            {multiProtocolOptions.length ? (
              <FieldSet>
                <FieldLegend>
                  {locale === "zh-CN" ? "测试协议" : "Test protocol"}
                </FieldLegend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {multiProtocolOptions.map((item) => (
                    <Field key={item.key}>
                      <FieldLabel className="truncate">
                        {[item.modelName, item.credentialName]
                          .filter(Boolean)
                          .join(" · ")}
                      </FieldLabel>
                      <Select
                        value={item.selectedProtocol}
                        onValueChange={(value) =>
                          onProtocolChange(item.key, value as ProtocolKind)
                        }
                        disabled={isBatchModelTestRunning}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {item.protocols.map((protocol) => (
                            <SelectItem key={protocol} value={protocol}>
                              {protocolLabel(protocol, locale)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  ))}
                </div>
              </FieldSet>
            ) : null}

            <BatchModelTestResults
              rows={batchTestRows}
              locale={locale}
              isRunning={isBatchModelTestRunning}
              onRetest={onRetestRow}
            />
          </div>
        </AppDialogContent>
      ) : null}
    </Dialog>
  );
}
