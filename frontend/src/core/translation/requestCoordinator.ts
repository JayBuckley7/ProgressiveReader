type InFlightRequest = {
  controller: AbortController;
  consumers: Map<symbol, (reason?: unknown) => void>;
  promise: Promise<unknown>;
  settled: boolean;
  orphanTimer?: ReturnType<typeof setTimeout>;
};

function makeAbortError(reason?: unknown): Error {
  if (reason instanceof Error) return reason;
  const message = typeof reason === "string" && reason.trim() ? reason : "Translation request was cancelled";
  if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function normalizeRequestKey(key: string): string {
  return String(key || "").trim();
}

/**
 * Shares one underlying request per content-addressed key. Each caller owns a
 * lease: cancelling a prefetch does not abort a matching foreground request,
 * while the underlying request is aborted once its final lease is released.
 */
export class TranslationRequestDeduper {
  private readonly inFlight = new Map<string, InFlightRequest>();

  request<T>(
    key: string,
    execute: (signal: AbortSignal) => Promise<T>,
    opts: { signal?: AbortSignal; orphanGraceMs?: number } = {}
  ): Promise<T> {
    const requestKey = normalizeRequestKey(key);
    if (!requestKey) return Promise.reject(new TypeError("request key must be non-empty"));
    if (opts.signal?.aborted) return Promise.reject(makeAbortError(opts.signal.reason));

    let entry = this.inFlight.get(requestKey);
    if (!entry) {
      const controller = new AbortController();
      const created: InFlightRequest = {
        controller,
        consumers: new Map(),
        promise: Promise.resolve().then(() => execute(controller.signal)),
        settled: false,
      };
      entry = created;
      this.inFlight.set(requestKey, created);

      void created.promise.then(
        () => this.finish(requestKey, created),
        () => this.finish(requestKey, created)
      );
    }

    const activeEntry = entry;
    if (activeEntry.orphanTimer !== undefined) {
      clearTimeout(activeEntry.orphanTimer);
      activeEntry.orphanTimer = undefined;
    }
    const consumerId = Symbol(requestKey);

    return new Promise<T>((resolve, reject) => {
      let consumerSettled = false;

      const release = () => {
        opts.signal?.removeEventListener("abort", handleCallerAbort);
        activeEntry.consumers.delete(consumerId);
        if (
          activeEntry.settled &&
          activeEntry.consumers.size === 0 &&
          activeEntry.orphanTimer === undefined &&
          this.inFlight.get(requestKey) === activeEntry
        ) {
          this.inFlight.delete(requestKey);
        }
      };

      const rejectCancelled = (reason?: unknown) => {
        if (consumerSettled) return;
        consumerSettled = true;
        release();
        reject(makeAbortError(reason));
      };

      const handleCallerAbort = () => {
        rejectCancelled(opts.signal?.reason);
        this.abortIfUnobserved(
          requestKey,
          activeEntry,
          opts.signal?.reason,
          opts.orphanGraceMs
        );
      };

      activeEntry.consumers.set(consumerId, rejectCancelled);
      opts.signal?.addEventListener("abort", handleCallerAbort, { once: true });

      void (activeEntry.promise as Promise<T>).then(
        (value) => {
          if (consumerSettled) return;
          consumerSettled = true;
          release();
          resolve(value);
        },
        (error) => {
          if (consumerSettled) return;
          consumerSettled = true;
          release();
          reject(error);
        }
      );
    });
  }

  has(key: string): boolean {
    return this.inFlight.has(normalizeRequestKey(key));
  }

  cancel(key: string, reason?: unknown): void {
    const requestKey = normalizeRequestKey(key);
    const entry = this.inFlight.get(requestKey);
    if (!entry) return;
    this.inFlight.delete(requestKey);
    if (entry.orphanTimer !== undefined) clearTimeout(entry.orphanTimer);
    entry.controller.abort(reason);
    for (const rejectConsumer of Array.from(entry.consumers.values())) {
      rejectConsumer(reason);
    }
    entry.consumers.clear();
  }

  cancelAll(reason?: unknown): void {
    for (const key of Array.from(this.inFlight.keys())) this.cancel(key, reason);
  }

  get size(): number {
    return this.inFlight.size;
  }

  private finish(key: string, entry: InFlightRequest): void {
    entry.settled = true;
    if (entry.orphanTimer === undefined && this.inFlight.get(key) === entry) {
      this.inFlight.delete(key);
    }
  }

  private abortIfUnobserved(
    key: string,
    entry: InFlightRequest,
    reason?: unknown,
    graceMs = 0
  ): void {
    if (entry.settled || entry.consumers.size > 0) return;
    const delay = Math.max(0, Math.trunc(graceMs));
    if (delay > 0) {
      if (entry.orphanTimer !== undefined) clearTimeout(entry.orphanTimer);
      entry.orphanTimer = setTimeout(() => {
        entry.orphanTimer = undefined;
        if (entry.consumers.size > 0) return;
        if (this.inFlight.get(key) === entry) this.inFlight.delete(key);
        if (!entry.settled) entry.controller.abort(reason);
      }, delay);
      return;
    }
    if (this.inFlight.get(key) === entry) this.inFlight.delete(key);
    entry.controller.abort(reason);
  }
}

export type TranslationSegmentRequest<TInput> = {
  /** A content-addressed key containing every setting that can affect output. */
  key: string;
  input: TInput;
};

type SegmentBatchWork = {
  controller: AbortController;
  entries: Set<SegmentInFlight>;
  settled: boolean;
  orphanGraceMs: number;
  orphanTimer?: ReturnType<typeof setTimeout>;
};

type SegmentInFlight = {
  key: string;
  work: SegmentBatchWork;
  consumers: Map<symbol, (reason?: unknown) => void>;
  promise: Promise<unknown>;
  settled: boolean;
  succeeded: boolean;
  retentionTimer?: ReturnType<typeof setTimeout>;
};

/**
 * Shares translation work at segment granularity while still batching newly
 * missing segments into one transport request. This matters during reflow: a
 * new page window can overlap only part of an already-dispatched batch, and
 * the overlapping segments must attach to that work instead of being paid for
 * a second time.
 */
export class TranslationSegmentRequestCoordinator {
  private readonly inFlight = new Map<string, SegmentInFlight>();

  requestBatch<TInput, TResult>(
    requested: readonly TranslationSegmentRequest<TInput>[],
    executeMissing: (
      missing: readonly TranslationSegmentRequest<TInput>[],
      signal: AbortSignal
    ) => Promise<ReadonlyMap<string, TResult>>,
    opts: { signal?: AbortSignal; orphanGraceMs?: number } = {}
  ): Promise<Map<string, TResult>> {
    if (opts.signal?.aborted) return Promise.reject(makeAbortError(opts.signal.reason));

    const unique = new Map<string, TranslationSegmentRequest<TInput>>();
    requested.forEach((item) => {
      const key = normalizeRequestKey(item.key);
      if (!key) throw new TypeError("segment request key must be non-empty");
      if (!unique.has(key)) unique.set(key, { key, input: item.input });
    });
    if (unique.size === 0) return Promise.resolve(new Map());

    const missing = Array.from(unique.values()).filter((item) => !this.inFlight.has(item.key));
    if (missing.length > 0) this.startBatch(missing, executeMissing);

    const leases = Array.from(unique.keys()).map(async (key) => {
      const entry = this.inFlight.get(key);
      if (!entry) throw new Error(`Translation segment request was not started: ${key}`);
      const result = await this.acquire<TResult>(entry, opts);
      return [key, result] as const;
    });

    return Promise.all(leases).then((entries) => new Map(entries));
  }

  has(key: string): boolean {
    return this.inFlight.has(normalizeRequestKey(key));
  }

  cancelAll(reason?: unknown): void {
    const works = new Set(Array.from(this.inFlight.values(), (entry) => entry.work));
    this.inFlight.clear();
    works.forEach((work) => {
      if (work.orphanTimer !== undefined) clearTimeout(work.orphanTimer);
      work.controller.abort(reason);
      work.entries.forEach((entry) => {
        if (entry.retentionTimer !== undefined) clearTimeout(entry.retentionTimer);
        for (const rejectConsumer of Array.from(entry.consumers.values())) {
          rejectConsumer(reason);
        }
        entry.consumers.clear();
      });
    });
  }

  get size(): number {
    return this.inFlight.size;
  }

  private startBatch<TInput, TResult>(
    missing: readonly TranslationSegmentRequest<TInput>[],
    executeMissing: (
      missing: readonly TranslationSegmentRequest<TInput>[],
      signal: AbortSignal
    ) => Promise<ReadonlyMap<string, TResult>>
  ): void {
    const work: SegmentBatchWork = {
      controller: new AbortController(),
      entries: new Set(),
      settled: false,
      orphanGraceMs: 0,
    };
    const workPromise = Promise.resolve().then(() => executeMissing(missing, work.controller.signal));
    void workPromise.then(
      () => {
        work.settled = true;
      },
      () => {
        work.settled = true;
      }
    );

    missing.forEach(({ key }) => {
      const entry: SegmentInFlight = {
        key,
        work,
        consumers: new Map(),
        promise: workPromise.then((results) => {
          if (!results.has(key)) {
            throw new Error("Translation response omitted a requested segment");
          }
          return results.get(key) as TResult;
        }),
        settled: false,
        succeeded: false,
      };
      work.entries.add(entry);
      this.inFlight.set(key, entry);
      void entry.promise.then(
        () => this.finishEntry(entry, true),
        () => this.finishEntry(entry, false)
      );
    });
  }

  private acquire<TResult>(
    entry: SegmentInFlight,
    opts: { signal?: AbortSignal; orphanGraceMs?: number }
  ): Promise<TResult> {
    const graceMs = Math.max(0, Math.trunc(opts.orphanGraceMs ?? 0));
    entry.work.orphanGraceMs = Math.max(entry.work.orphanGraceMs, graceMs);
    if (entry.work.orphanTimer !== undefined) {
      clearTimeout(entry.work.orphanTimer);
      entry.work.orphanTimer = undefined;
    }
    if (entry.retentionTimer !== undefined) {
      clearTimeout(entry.retentionTimer);
      entry.retentionTimer = undefined;
    }
    const consumerId = Symbol(entry.key);

    return new Promise<TResult>((resolve, reject) => {
      let consumerSettled = false;

      const release = () => {
        opts.signal?.removeEventListener("abort", handleCallerAbort);
        entry.consumers.delete(consumerId);
        this.retireEntryWhenUnobserved(entry);
      };

      const rejectCancelled = (reason?: unknown) => {
        if (consumerSettled) return;
        consumerSettled = true;
        release();
        reject(makeAbortError(reason));
      };

      const handleCallerAbort = () => {
        rejectCancelled(opts.signal?.reason);
        this.abortWorkIfUnobserved(entry.work, opts.signal?.reason);
      };

      entry.consumers.set(consumerId, rejectCancelled);
      opts.signal?.addEventListener("abort", handleCallerAbort, { once: true });

      void (entry.promise as Promise<TResult>).then(
        (value) => {
          if (consumerSettled) return;
          consumerSettled = true;
          release();
          resolve(value);
        },
        (error) => {
          if (consumerSettled) return;
          consumerSettled = true;
          release();
          reject(error);
        }
      );
    });
  }

  private finishEntry(entry: SegmentInFlight, succeeded: boolean): void {
    entry.settled = true;
    entry.succeeded = succeeded;
    this.retireEntryWhenUnobserved(entry);
  }

  private retireEntryWhenUnobserved(entry: SegmentInFlight): void {
    if (!entry.settled || entry.consumers.size > 0 || this.inFlight.get(entry.key) !== entry) {
      return;
    }
    if (entry.retentionTimer !== undefined) clearTimeout(entry.retentionTimer);
    if (!entry.succeeded || entry.work.orphanGraceMs <= 0) {
      this.inFlight.delete(entry.key);
      return;
    }
    entry.retentionTimer = setTimeout(() => {
      entry.retentionTimer = undefined;
      if (entry.consumers.size === 0 && this.inFlight.get(entry.key) === entry) {
        this.inFlight.delete(entry.key);
      }
    }, entry.work.orphanGraceMs);
  }

  private abortWorkIfUnobserved(work: SegmentBatchWork, reason?: unknown): void {
    if (
      work.settled ||
      Array.from(work.entries).some((entry) => entry.consumers.size > 0) ||
      work.controller.signal.aborted
    ) {
      return;
    }
    if (work.orphanTimer !== undefined) clearTimeout(work.orphanTimer);
    const abort = () => {
      work.orphanTimer = undefined;
      if (work.settled || Array.from(work.entries).some((entry) => entry.consumers.size > 0)) return;
      work.entries.forEach((entry) => {
        if (entry.retentionTimer !== undefined) clearTimeout(entry.retentionTimer);
        if (this.inFlight.get(entry.key) === entry) this.inFlight.delete(entry.key);
      });
      work.controller.abort(reason);
    };
    if (work.orphanGraceMs > 0) {
      work.orphanTimer = setTimeout(abort, work.orphanGraceMs);
    } else {
      abort();
    }
  }
}

export type TranslationRequestToken = {
  readonly slot: string;
  readonly revision: number;
  readonly signal: AbortSignal;
};

type ActiveSlot = {
  revision: number;
  controller: AbortController;
};

/**
 * Provides independently replaceable lanes such as `current` and `next`.
 * `accept` is the final stale-response check before committing a result.
 */
export class TranslationRequestSlots {
  private readonly active = new Map<string, ActiveSlot>();
  private readonly revisions = new Map<string, number>();

  begin(slot: string): TranslationRequestToken {
    const normalizedSlot = String(slot || "").trim();
    if (!normalizedSlot) throw new TypeError("slot must be non-empty");

    this.cancel(normalizedSlot, "Superseded by a newer translation request");
    const revision = (this.revisions.get(normalizedSlot) || 0) + 1;
    const controller = new AbortController();
    this.revisions.set(normalizedSlot, revision);
    this.active.set(normalizedSlot, { revision, controller });
    return { slot: normalizedSlot, revision, signal: controller.signal };
  }

  isCurrent(token: TranslationRequestToken): boolean {
    const current = this.active.get(token.slot);
    return Boolean(
      current &&
        current.revision === token.revision &&
        current.controller.signal === token.signal &&
        !token.signal.aborted
    );
  }

  accept(token: TranslationRequestToken): boolean {
    if (!this.isCurrent(token)) return false;
    this.active.delete(token.slot);
    return true;
  }

  cancel(slot: string, reason?: unknown): void {
    const normalizedSlot = String(slot || "").trim();
    const current = this.active.get(normalizedSlot);
    if (!current) return;
    this.active.delete(normalizedSlot);
    current.controller.abort(reason);
  }

  cancelAll(reason?: unknown): void {
    for (const slot of Array.from(this.active.keys())) this.cancel(slot, reason);
  }
}
