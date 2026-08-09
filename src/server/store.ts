import type { ScanJob, ScanProgress } from "../shared/types.js";

const jobs = new Map<string, ScanJob>();

export const scanStore = {
  create(job: ScanJob) {
    jobs.set(job.id, job);
    return job;
  },
  get(id: string) {
    return jobs.get(id);
  },
  list() {
    return Array.from(jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  update(id: string, patch: Partial<ScanJob>) {
    const job = jobs.get(id);
    if (!job) return undefined;
    const next = { ...job, ...patch, updatedAt: new Date().toISOString() };
    jobs.set(id, next);
    return next;
  },
  pushProgress(id: string, progress: ScanProgress) {
    const job = jobs.get(id);
    if (!job) return undefined;
    job.progress.push(progress);
    job.updatedAt = progress.at;
    jobs.set(id, job);
    return job;
  }
};
