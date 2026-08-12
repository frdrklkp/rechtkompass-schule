// Sequentieller Request-Queue-Guard. Verhindert parallele KI-Aufrufe
// pro Fall/Task, damit die UI und die Session-Historie konsistent bleiben.

type Task<T> = () => Promise<T>;

const queues = new Map<string, Promise<unknown>>();

export function enqueue<T>(key: string, task: Task<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  queues.set(
    key,
    next.finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    }),
  );
  return next;
}
