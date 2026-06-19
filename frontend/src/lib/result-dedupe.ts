import type { GenerateRecord } from "./api";

interface DedupeOptions {
  limit?: number;
  sortByTimestamp?: boolean;
}

function normalizeImageUrl(url: string): string {
  const clean = url.trim();
  if (!clean) return "";
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(clean, base);
    parsed.hash = "";
    return parsed.pathname + parsed.search;
  } catch {
    return clean;
  }
}

function taskIdFromRecord(record: GenerateRecord): string {
  const direct = record.task_id || record.taskId;
  if (direct) return String(direct).trim();
  const params = record.params || {};
  const fromParams = (params.task_id || params.taskId) as unknown;
  return fromParams ? String(fromParams).trim() : "";
}

export function primaryImageUrl(record: GenerateRecord): string {
  return normalizeImageUrl(record.images?.[0] || "");
}

export function normalizedTimestamp(timestamp?: number): number {
  if (!timestamp) return 0;
  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

export function generatedResultKey(record: GenerateRecord, fallback = 0): string {
  const image = primaryImageUrl(record);
  if (image) return `image:${image}`;
  const taskId = taskIdFromRecord(record);
  if (taskId) return `task:${taskId}`;
  return `${record.type || "image"}:${normalizedTimestamp(record.timestamp)}:${fallback}`;
}

export function isSameGeneratedResult(left: GenerateRecord, right: GenerateRecord): boolean {
  const leftImage = primaryImageUrl(left);
  const rightImage = primaryImageUrl(right);
  if (leftImage && rightImage && leftImage === rightImage) return true;

  const leftTaskId = taskIdFromRecord(left);
  const rightTaskId = taskIdFromRecord(right);
  if (leftTaskId && rightTaskId && leftTaskId === rightTaskId) return true;

  return false;
}

export function dedupeGeneratedRecords(records: GenerateRecord[], options: DedupeOptions = {}): GenerateRecord[] {
  const limit = options.limit ?? 48;
  const next: GenerateRecord[] = [];
  records.forEach((record) => {
    if (!next.some((item) => isSameGeneratedResult(item, record))) {
      next.push(record);
    }
  });
  if (options.sortByTimestamp) {
    next.sort((a, b) => normalizedTimestamp(b.timestamp) - normalizedTimestamp(a.timestamp));
  }
  return next.slice(0, limit);
}

export function upsertGeneratedRecord(
  records: GenerateRecord[],
  record: GenerateRecord,
  options: DedupeOptions = {}
): GenerateRecord[] {
  const withoutDuplicate = records.filter((item) => !isSameGeneratedResult(item, record));
  return dedupeGeneratedRecords([record, ...withoutDuplicate], options);
}
