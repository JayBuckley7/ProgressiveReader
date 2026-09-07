import { describe, expect, it, vi } from "vitest";

import {
  TranslationRequestDeduper,
  TranslationSegmentRequestCoordinator,
  TranslationRequestSlots,
} from "@core/translation/requestCoordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("TranslationRequestDeduper", () => {
  it("shares one underlying request while allowing one consumer to cancel", async () => {
    const pending = deferred<string>();
    let underlyingSignal: AbortSignal | undefined;
    const execute = vi.fn((signal: AbortSignal) => {
      underlyingSignal = signal;
      return pending.promise;
    });
    const firstConsumer = new AbortController();
    const deduper = new TranslationRequestDeduper();

    const first = deduper.request("same-segment", execute, { signal: firstConsumer.signal });
    const second = deduper.request("same-segment", execute);
    const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });

    firstConsumer.abort("prefetch no longer needed");
    await firstRejected;
    expect(execute).toHaveBeenCalledTimes(1);
    expect(underlyingSignal?.aborted).toBe(false);

    pending.resolve("translated");
    await expect(second).resolves.toBe("translated");
    expect(deduper.size).toBe(0);
  });

  it("aborts the underlying request after its final consumer cancels", async () => {
    const pending = deferred<string>();
    let underlyingSignal: AbortSignal | undefined;
    const consumer = new AbortController();
    const deduper = new TranslationRequestDeduper();
    const request = deduper.request(
      "only-segment",
      (signal) => {
        underlyingSignal = signal;
        return pending.promise;
      },
      { signal: consumer.signal }
    );
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });

    consumer.abort();
    await rejected;
    expect(underlyingSignal?.aborted).toBe(true);
    expect(deduper.size).toBe(0);

    // Let an implementation that ignores AbortSignal settle without leaking.
    pending.resolve("late");
    await Promise.resolve();
  });

  it("hands an orphaned lookahead request to the next page without paying twice", async () => {
    const pending = deferred<string>();
    const execute = vi.fn(() => pending.promise);
    const lookahead = new AbortController();
    const deduper = new TranslationRequestDeduper();
    const first = deduper.request("page-segment", execute, {
      signal: lookahead.signal,
      orphanGraceMs: 500,
    });
    const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });

    lookahead.abort("page window advanced");
    await firstRejected;
    const foreground = deduper.request("page-segment", execute);
    expect(execute).toHaveBeenCalledTimes(1);

    pending.resolve("translated once");
    await expect(foreground).resolves.toBe("translated once");
    expect(deduper.size).toBe(0);
  });
});

describe("TranslationSegmentRequestCoordinator", () => {
  it("deduplicates overlapping segments while batching only newly missing work", async () => {
    const firstBatch = deferred<ReadonlyMap<string, string>>();
    const addedBatch = deferred<ReadonlyMap<string, string>>();
    const executions: string[][] = [];
    const coordinator = new TranslationSegmentRequestCoordinator();
    const firstConsumer = new AbortController();
    const execute = vi.fn((missing: readonly { key: string; input: string }[]) => {
      executions.push(missing.map((item) => item.key));
      return executions.length === 1 ? firstBatch.promise : addedBatch.promise;
    });

    const first = coordinator.requestBatch(
      [
        { key: "config:A", input: "A" },
        { key: "config:B", input: "B" },
      ],
      execute,
      { signal: firstConsumer.signal, orphanGraceMs: 500 }
    );
    await Promise.resolve();

    const narrowed = coordinator.requestBatch(
      [{ key: "config:A", input: "A" }],
      execute
    );
    const expanded = coordinator.requestBatch(
      [
        { key: "config:A", input: "A" },
        { key: "config:B", input: "B" },
        { key: "config:C", input: "C" },
      ],
      execute
    );
    await Promise.resolve();

    expect(executions).toEqual([["config:A", "config:B"], ["config:C"]]);
    const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    firstConsumer.abort("reflowed");
    await firstRejected;

    firstBatch.resolve(new Map([
      ["config:A", "translated A"],
      ["config:B", "translated B"],
    ]));
    addedBatch.resolve(new Map([["config:C", "translated C"]]));

    await expect(narrowed).resolves.toEqual(new Map([["config:A", "translated A"]]));
    await expect(expanded).resolves.toEqual(new Map([
      ["config:A", "translated A"],
      ["config:B", "translated B"],
      ["config:C", "translated C"],
    ]));
    expect(execute).toHaveBeenCalledTimes(2);
    coordinator.cancelAll("test cleanup");
    expect(coordinator.size).toBe(0);
  });

  it("does not share a segment across different full configuration keys", async () => {
    const coordinator = new TranslationSegmentRequestCoordinator();
    const execute = vi.fn(async (missing: readonly { key: string; input: string }[]) =>
      new Map(missing.map((item) => [item.key, item.input]))
    );

    await Promise.all([
      coordinator.requestBatch(
        [{ key: "model=luna;lang=en;cefr=false;hash=one", input: "plain" }],
        execute
      ),
      coordinator.requestBatch(
        [{ key: "model=luna;lang=en;cefr=true;hash=one", input: "cefr" }],
        execute
      ),
    ]);

    expect(execute).toHaveBeenCalledTimes(2);
  });
});

describe("TranslationRequestSlots", () => {
  it("supersedes a lane and rejects stale tokens without affecting other lanes", () => {
    const slots = new TranslationRequestSlots();
    const oldCurrent = slots.begin("current");
    const next = slots.begin("next");
    const current = slots.begin("current");

    expect(oldCurrent.signal.aborted).toBe(true);
    expect(slots.isCurrent(oldCurrent)).toBe(false);
    expect(slots.isCurrent(next)).toBe(true);
    expect(slots.isCurrent(current)).toBe(true);
    expect(slots.accept(oldCurrent)).toBe(false);
    expect(slots.accept(current)).toBe(true);
    expect(slots.isCurrent(current)).toBe(false);
    expect(slots.isCurrent(next)).toBe(true);
  });
});
