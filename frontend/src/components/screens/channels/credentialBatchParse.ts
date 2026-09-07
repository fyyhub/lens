/** A key + remark pair parsed from one non-empty batch input line. */
export type CredentialBatchDraft = {
  apiKey: string;
  name: string;
};

export type CredentialBatchParseResult = {
  drafts: CredentialBatchDraft[];
  duplicateCount: number;
  invalidCount: number;
};

// Keys never contain whitespace or commas, so the first one ends the key and
// the remainder of the line becomes the remark.
const SEPARATOR_PATTERN = /[\s,，]/;

/**
 * Parses pasted batch key text: one key per line, with an optional remark
 * after the first comma, tab, or whitespace run. Keys already present in
 * `existingApiKeys` or repeated within the text are counted as duplicates.
 */
export function parseCredentialBatchText(
  text: string,
  existingApiKeys: readonly string[],
): CredentialBatchParseResult {
  const seenApiKeys = new Set(existingApiKeys);
  const drafts: CredentialBatchDraft[] = [];
  let duplicateCount = 0;
  let invalidCount = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separatorIndex = line.search(SEPARATOR_PATTERN);
    const apiKey = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    if (!apiKey) {
      invalidCount += 1;
      continue;
    }
    if (seenApiKeys.has(apiKey)) {
      duplicateCount += 1;
      continue;
    }
    seenApiKeys.add(apiKey);
    const name =
      separatorIndex === -1 ? "" : line.slice(separatorIndex + 1).trim();
    drafts.push({ apiKey, name });
  }
  return { drafts, duplicateCount, invalidCount };
}
