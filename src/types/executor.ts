import type { Job, ExecEvents, ProducedFile } from './job'

/**
 * Execution backend. Receives a fully compiled Job — graph -> command
 * compilation always happens in the frontend; backends may rewrite args
 * (e.g. swap libx264 for a hardware encoder) but never see the raw graph.
 */
export interface Executor {
  readonly id: string
  readonly label: string
  /**
   * @param assets  bytes for every asset referenced by the job, keyed by asset id.
   *                Server-style backends may ignore this and resolve refs themselves.
   */
  run(
    job: Job,
    assets: Record<string, Uint8Array>,
    events: ExecEvents,
  ): Promise<ProducedFile[]>
  cancel(): void
  readonly running: boolean
}
