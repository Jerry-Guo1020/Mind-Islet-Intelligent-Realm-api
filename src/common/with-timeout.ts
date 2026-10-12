/** 给一个 Promise 加超时。超时后 reject，已经落定的 promise 不再受影响。 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'operation timed out',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
