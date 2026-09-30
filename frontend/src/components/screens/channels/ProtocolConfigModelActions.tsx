import { Plus, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Separator } from "@/components/ui/Separator";
import type { FormProtocolConfig, Locale } from "./channelTypes";
import { ProtocolMultiSelect } from "./ProtocolMultiSelect";

type Props = {
  protocolConfig: FormProtocolConfig;
  protocolConfigIndex: number;
  locale: Locale;
  fetchingProtocolConfigIndex: number | null;
  hasActiveBaseUrl: boolean;
  hasActiveCredentials: boolean;
  onUpdate: (patch: Partial<FormProtocolConfig>) => void;
  onAddManualModel: () => void;
  onFetchModels: () => void;
};

/** Renders manual model entry and model discovery actions for a protocol config. */
export function ProtocolConfigModelActions({
  protocolConfig,
  protocolConfigIndex,
  locale,
  fetchingProtocolConfigIndex,
  hasActiveBaseUrl,
  hasActiveCredentials,
  onUpdate,
  onAddManualModel,
  onFetchModels,
}: Props) {
  const manualModelName = protocolConfig.manual_model_name.trim();
  const isAddModelDisabled =
    !hasActiveCredentials ||
    !manualModelName ||
    !protocolConfig.manual_protocols.length;
  const isFetchModelsDisabled =
    fetchingProtocolConfigIndex !== null ||
    !hasActiveBaseUrl ||
    !hasActiveCredentials ||
    !protocolConfig.manual_protocols.length;
  const isFetchPending = fetchingProtocolConfigIndex === protocolConfigIndex;

  return (
    <div className="grid gap-3 pt-1">
      <Separator />
      <FieldGroup className="gap-3">
        <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.42fr)_auto] lg:items-end">
          <Field>
            <FieldLabel>
              {locale === "zh-CN" ? "模型名称" : "Model name"}
            </FieldLabel>
            <Input
              className="w-full min-w-0"
              value={protocolConfig.manual_model_name}
              onChange={(event) =>
                onUpdate({ manual_model_name: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key !== "Enter" || isAddModelDisabled) return;
                event.preventDefault();
                onAddManualModel();
              }}
              placeholder={
                locale === "zh-CN" ? "输入模型名称" : "Enter a model name"
              }
            />
          </Field>
          <Field>
            <FieldLabel>
              {locale === "zh-CN" ? "上游协议" : "Upstream protocols"}
            </FieldLabel>
            <ProtocolMultiSelect
              value={protocolConfig.manual_protocols}
              onChange={(next) => onUpdate({ manual_protocols: next })}
              locale={locale}
              invalid={protocolConfig.manual_protocols.length === 0}
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            onClick={onAddManualModel}
            disabled={isAddModelDisabled}
          >
            <Plus data-icon="inline-start" />
            {locale === "zh-CN" ? "添加模型" : "Add model"}
          </Button>
        </div>
        <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Field>
            <FieldLabel>
              {locale === "zh-CN" ? "上游筛选" : "Upstream filter"}
            </FieldLabel>
            <Input
              value={protocolConfig.model_filter}
              onChange={(event) =>
                onUpdate({ model_filter: event.target.value })
              }
              placeholder={
                locale === "zh-CN"
                  ? "筛选上游模型（支持正则），留空匹配全部，仅本次获取有效"
                  : "Filter upstream models (regex supported); leave blank to match all. Applies to this fetch only."
              }
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            onClick={onFetchModels}
            disabled={isFetchModelsDisabled}
          >
            <RefreshCcw
              data-icon="inline-start"
              className={isFetchPending ? "animate-spin" : undefined}
            />
            {locale === "zh-CN" ? "从上游选择" : "Select from upstream"}
          </Button>
        </div>
      </FieldGroup>
    </div>
  );
}
