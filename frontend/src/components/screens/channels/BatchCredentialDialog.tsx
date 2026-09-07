import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AppDialogContent, Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Textarea";
import type { Locale } from "./channelTypes";
import {
  type CredentialBatchDraft,
  parseCredentialBatchText,
} from "./credentialBatchParse";

type Props = {
  open: boolean;
  locale: Locale;
  existingApiKeys: string[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (drafts: CredentialBatchDraft[]) => void;
};

/** Lets users paste many API keys at once and preview how they parse. */
export function BatchCredentialDialog({
  open,
  locale,
  existingApiKeys,
  onOpenChange,
  onConfirm,
}: Props) {
  const [batchText, setBatchText] = useState("");
  const parseResult = useMemo(
    () => parseCredentialBatchText(batchText, existingApiKeys),
    [batchText, existingApiKeys],
  );
  const isZh = locale === "zh-CN";
  const readyCount = parseResult.drafts.length;

  function closeDialog() {
    setBatchText("");
    onOpenChange(false);
  }

  function confirmBatch() {
    if (!readyCount) return;
    onConfirm(parseResult.drafts);
    setBatchText("");
    onOpenChange(false);
  }

  const feedbackParts = [
    isZh ? `可添加 ${readyCount} 个密钥` : `${readyCount} keys ready to add`,
  ];
  if (parseResult.duplicateCount) {
    feedbackParts.push(
      isZh
        ? `${parseResult.duplicateCount} 个重复已跳过`
        : `${parseResult.duplicateCount} duplicates skipped`,
    );
  }
  if (parseResult.invalidCount) {
    feedbackParts.push(
      isZh
        ? `${parseResult.invalidCount} 行无效`
        : `${parseResult.invalidCount} invalid lines`,
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog();
          return;
        }
        onOpenChange(true);
      }}
    >
      <AppDialogContent
        title={isZh ? "批量添加密钥" : "Add keys in batch"}
        description={
          isZh
            ? "每行一个密钥，可在密钥后用逗号或空格附加备注；与现有或前文重复的密钥会自动跳过。"
            : "One key per line. Append a remark after the key with a comma or space. Keys already listed above or repeated here are skipped."
        }
      >
        <div className="grid gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="credential-batch-text">
                {isZh ? "密钥列表" : "Key list"}
              </FieldLabel>
              <Textarea
                id="credential-batch-text"
                value={batchText}
                onChange={(event) => setBatchText(event.target.value)}
                className="min-h-[220px] font-mono text-xs"
                spellCheck={false}
                placeholder={"sk-aaa,remark A\nsk-bbb remark B\nsk-ccc"}
              />
              {batchText.trim() ? (
                <FieldDescription>
                  {feedbackParts.join(isZh ? "，" : ", ")}
                </FieldDescription>
              ) : null}
            </Field>
          </FieldGroup>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="outline" onClick={closeDialog}>
              {isZh ? "取消" : "Cancel"}
            </Button>
            <Button type="button" onClick={confirmBatch} disabled={!readyCount}>
              {isZh
                ? `添加 ${readyCount} 个密钥`
                : `Add ${readyCount} ${readyCount === 1 ? "key" : "keys"}`}
            </Button>
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
