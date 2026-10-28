import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiRequest, getApiErrorMessage } from "@/lib/api/client";
import type { ProtocolKind } from "@/lib/api/protocols";
import type { SiteModelTestResult } from "@/lib/api/sites";
import { selectedModelTestProtocol } from "./modelTestSession";

export type BatchModelTestStatus = "pending" | "running" | "success" | "failed";

export type BatchModelTestRow = {
  key: string;
  optionKey: string;
  modelName: string;
  credentialName: string;
  credentialId: string;
  credentialApiKey?: string;
  protocol: ProtocolKind;
  status: BatchModelTestStatus;
  statusCode: number | null;
  latencyMs?: number;
  message: string;
};

export type BatchModelTestSource<TTarget> = {
  key: string;
  target: TTarget;
  modelName: string;
  credentialName: string;
  /** How many keys this model is tested against; defaults to one. */
  credentialCount?: number;
  protocols: ProtocolKind[];
};

export type BatchModelTestOption = {
  key: string;
  modelName: string;
  credentialName: string;
  credentialCount: number;
  protocols: ProtocolKind[];
  selectedProtocol: ProtocolKind;
};

export type PreparedBatchModelTestRequest = {
  path: string;
  payload: object;
  modelName: string;
  credentialName: string;
  credentialId: string;
  credentialApiKey?: string;
  protocol: ProtocolKind;
};

type RunEntry = {
  key: string;
  request: PreparedBatchModelTestRequest;
  row: BatchModelTestRow;
};

type Options<TTarget> = {
  locale: "zh-CN" | "en-US";
  prompts: string[];
  optionByKey: ReadonlyMap<string, BatchModelTestSource<TTarget>>;
  /** Expands one model into every request it needs, e.g. one per key. */
  prepareRequests: (
    target: TTarget,
    protocol: ProtocolKind,
    prompt: string,
  ) => PreparedBatchModelTestRequest[];
};

/** Owns batch model-test prompts, concurrency, cancellation, and result rows. */
export function useBatchModelTestSession<TTarget>({
  locale,
  prompts,
  optionByKey,
  prepareRequests,
}: Options<TTarget>) {
  const [batchModelTestOpen, setBatchModelTestOpen] = useState(false);
  const [isBatchModelTestRunning, setIsBatchModelTestRunning] = useState(false);
  const [batchTestPromptMode, setBatchTestPromptMode] = useState("0");
  const [batchTestConcurrency, setBatchTestConcurrency] = useState("1");
  const [batchTestPrompt, setBatchTestPrompt] = useState("");
  const [protocolByKey, setProtocolByKey] = useState<
    Record<string, ProtocolKind>
  >({});
  const [batchTestRows, setBatchTestRows] = useState<BatchModelTestRow[]>([]);
  // Tracked as exclusions so newly discovered models stay selected by default.
  const [deselectedKeys, setDeselectedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const abortController = useRef<AbortController | null>(null);
  const batchTestOptions = useMemo<BatchModelTestOption[]>(() => {
    const options: BatchModelTestOption[] = [];
    for (const option of optionByKey.values()) {
      const selectedProtocol = selectedModelTestProtocol(
        option.protocols,
        protocolByKey[option.key] ?? null,
      );
      if (!selectedProtocol) continue;
      options.push({
        key: option.key,
        modelName: option.modelName,
        credentialName: option.credentialName,
        credentialCount: option.credentialCount ?? 1,
        protocols: option.protocols,
        selectedProtocol,
      });
    }
    return options;
  }, [optionByKey, protocolByKey]);
  const batchTestSelectedOptions = useMemo(
    () => batchTestOptions.filter((option) => !deselectedKeys.has(option.key)),
    [batchTestOptions, deselectedKeys],
  );

  useEffect(() => () => abortController.current?.abort(), []);

  function cancelBatchModelTests() {
    abortController.current?.abort();
    abortController.current = null;
    setIsBatchModelTestRunning(false);
  }

  function clearBatchModelTestResults() {
    cancelBatchModelTests();
    setBatchModelTestOpen(false);
    setBatchTestPromptMode("0");
    setBatchTestPrompt("");
    setProtocolByKey({});
    setBatchTestRows([]);
    setDeselectedKeys(new Set());
  }

  function changeBatchModelTestOpen(open: boolean) {
    if (!open) cancelBatchModelTests();
    setBatchModelTestOpen(open);
  }

  function openBatchModelTestDialog() {
    setBatchTestPromptMode("0");
    setBatchTestPrompt(prompts[0] || "");
    setProtocolByKey({});
    setBatchTestRows([]);
    setDeselectedKeys(new Set());
    setBatchModelTestOpen(true);
  }

  function toggleBatchTestModel(key: string) {
    setDeselectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllBatchTestModels() {
    setDeselectedKeys(new Set());
  }

  function clearBatchTestModelSelection() {
    setDeselectedKeys(new Set(batchTestOptions.map((option) => option.key)));
  }

  function changeBatchTestPromptMode(value: string) {
    setBatchTestPromptMode(value);
    setBatchTestRows([]);
    if (value !== "custom") setBatchTestPrompt(prompts[Number(value)] || "");
  }

  function changeBatchTestPrompt(value: string) {
    if (batchTestPromptMode !== "custom") setBatchTestPromptMode("custom");
    setBatchTestPrompt(value);
    setBatchTestRows([]);
  }

  function changeBatchTestProtocol(key: string, protocol: ProtocolKind) {
    setProtocolByKey((current) => ({ ...current, [key]: protocol }));
    setBatchTestRows([]);
  }

  function updateRow(key: string, patch: Partial<BatchModelTestRow>) {
    setBatchTestRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function buildEntries(
    option: BatchModelTestOption,
    prompt: string,
    protocol: ProtocolKind = option.selectedProtocol,
  ): RunEntry[] {
    const source = optionByKey.get(option.key);
    if (!source) return [];
    return prepareRequests(source.target, protocol, prompt).map((request) => {
      const key = `${option.key}:${request.protocol}:${request.credentialId}`;
      return {
        key,
        request,
        row: {
          key,
          optionKey: option.key,
          modelName: request.modelName,
          credentialName: request.credentialName,
          credentialId: request.credentialId,
          credentialApiKey: request.credentialApiKey,
          protocol: request.protocol,
          status: "pending",
          statusCode: null,
          latencyMs: undefined,
          message: "",
        },
      };
    });
  }

  async function runEntries(entries: RunEntry[], mode: "replace" | "merge") {
    if (!entries.length) {
      toast.error(
        locale === "zh-CN" ? "没有可测试的模型" : "No testable models",
      );
      return;
    }
    setBatchTestRows((current) => {
      const next = mode === "replace" ? [] : [...current];
      for (const entry of entries) {
        const index = next.findIndex((row) => row.key === entry.key);
        if (index >= 0) next[index] = entry.row;
        else next.push(entry.row);
      }
      return next;
    });
    const parsedConcurrency = Number.parseInt(batchTestConcurrency, 10);
    const concurrency = Math.max(
      1,
      Math.min(
        Number.isFinite(parsedConcurrency) ? parsedConcurrency : 1,
        20,
        entries.length,
      ),
    );
    let cursor = 0;
    let succeeded = 0;
    let failed = 0;
    const controller = new AbortController();
    abortController.current?.abort();
    abortController.current = controller;
    setIsBatchModelTestRunning(true);
    try {
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (!controller.signal.aborted && cursor < entries.length) {
            const entry = entries[cursor++];
            updateRow(entry.key, { status: "running", message: "" });
            try {
              const result = await apiRequest<SiteModelTestResult>(
                entry.request.path,
                {
                  method: "POST",
                  body: JSON.stringify(entry.request.payload),
                  signal: controller.signal,
                },
              );
              updateRow(entry.key, {
                status: result.success ? "success" : "failed",
                statusCode: result.status_code,
                latencyMs: result.latency_ms,
                message: result.success
                  ? result.output_text ||
                    (locale === "zh-CN"
                      ? "上游返回成功，但没有可展示文本"
                      : "Upstream succeeded but returned no displayable text")
                  : result.error_message ||
                    (locale === "zh-CN" ? "测试失败" : "Model test failed"),
              });
              if (result.success) succeeded += 1;
              else failed += 1;
            } catch (error) {
              if (controller.signal.aborted) return;
              updateRow(entry.key, {
                status: "failed",
                statusCode: null,
                latencyMs: undefined,
                message: getApiErrorMessage(
                  error,
                  locale === "zh-CN" ? "测试请求失败" : "Test request failed",
                ),
              });
              failed += 1;
            }
          }
        }),
      );
      if (controller.signal.aborted) return;
      const isSingle = entries.length === 1;
      toast[failed ? "error" : "success"](
        locale === "zh-CN"
          ? `${isSingle ? "测试" : "批量测试"}完成：成功 ${succeeded}，失败 ${failed}`
          : `${isSingle ? "Test" : "Batch test"} finished: ${succeeded} succeeded, ${failed} failed`,
      );
    } finally {
      if (abortController.current === controller) {
        abortController.current = null;
        setIsBatchModelTestRunning(false);
      }
    }
  }

  /** Runs the selected models, or only `keys` when a subset is requested. */
  async function runBatchModelTests(keys?: readonly string[]) {
    const prompt = batchTestPrompt.trim();
    if (!prompt) {
      toast.error(locale === "zh-CN" ? "测试问题为空" : "Test prompt is empty");
      return;
    }
    const allowed = new Set(
      keys ?? batchTestSelectedOptions.map((option) => option.key),
    );
    const entries: RunEntry[] = [];
    for (const option of batchTestOptions) {
      if (!allowed.has(option.key)) continue;
      entries.push(...buildEntries(option, prompt));
    }
    setBatchTestPrompt(prompt);
    await runEntries(entries, "replace");
  }

  /** Re-runs one result row in place, keeping the other rows untouched. */
  async function retestBatchModelRow(rowKey: string) {
    const row = batchTestRows.find((item) => item.key === rowKey);
    if (!row) return;
    const prompt = batchTestPrompt.trim();
    if (!prompt) {
      toast.error(locale === "zh-CN" ? "测试问题为空" : "Test prompt is empty");
      return;
    }
    const option = batchTestOptions.find((item) => item.key === row.optionKey);
    if (!option) {
      toast.error(
        locale === "zh-CN"
          ? "该模型已不可测试"
          : "This model is no longer testable",
      );
      return;
    }
    const entry = buildEntries(option, prompt, row.protocol).find(
      (item) => item.key === rowKey,
    );
    if (!entry) return;
    await runEntries([entry], "merge");
  }

  return {
    batchModelTestOpen,
    batchTestConcurrency,
    batchTestDeselectedKeys: deselectedKeys,
    batchTestOptions,
    batchTestPrompt,
    batchTestPromptMode,
    batchTestRows,
    batchTestSelectedOptions,
    changeBatchModelTestOpen,
    changeBatchTestPrompt,
    changeBatchTestPromptMode,
    changeBatchTestProtocol,
    clearBatchModelTestResults,
    clearBatchTestModelSelection,
    isBatchModelTestRunning,
    openBatchModelTestDialog,
    retestBatchModelRow,
    runBatchModelTests,
    selectAllBatchTestModels,
    setBatchTestConcurrency,
    toggleBatchTestModel,
  };
}
