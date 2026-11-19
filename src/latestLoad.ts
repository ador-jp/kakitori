export function createLatestLoad<Input, Value>(load: (input: Input) => Promise<Value>, apply: (value: Value) => void, onError: (error: unknown) => void) {
  let request = 0;
  return {
    invalidate() { request++; },
    async run(input: Input) {
      const current = ++request;
      try {
        const value = await load(input);
        if (current === request) apply(value);
      } catch (error) {
        if (current === request) onError(error);
      }
    }
  };
}
