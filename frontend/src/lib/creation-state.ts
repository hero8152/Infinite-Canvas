export type CreationTaskStatus = "idle" | "pending" | "running" | "failed" | "succeeded";

export interface CreationTaskSummary {
  status: CreationTaskStatus;
  label: string;
  detail: string;
  prompt?: string;
  error?: string;
  startedAt?: number;
}

export function idleTask(label: string, detail: string): CreationTaskSummary {
  return {
    status: "idle",
    label,
    detail
  };
}
