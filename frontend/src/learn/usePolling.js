import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads data with `loader` and keeps reloading every `interval` ms while
 * `shouldPoll(data)` is true (e.g. while AI is still generating chapters).
 * Polling restarts by itself whenever new data needs it (after "Thử lại").
 */
export const usePolling = (loader, { interval = 2500, shouldPoll = () => false, key = "" } = {}) => {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const loaderRef = useRef(loader);
  const pollRef = useRef(shouldPoll);
  useEffect(() => { loaderRef.current = loader; pollRef.current = shouldPoll; });

  const reload = useCallback(async () => {
    try {
      const data = await loaderRef.current();
      setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      setState((current) => ({ ...current, error, loading: false }));
      return null;
    }
  }, []);

  useEffect(() => { reload(); }, [reload, key]);

  useEffect(() => {
    if (!state.data || !pollRef.current(state.data)) return undefined;
    const timer = window.setTimeout(reload, interval);
    return () => window.clearTimeout(timer);
  }, [state.data, reload, interval]);

  const setData = useCallback((updater) => setState((current) => ({ ...current, data: typeof updater === "function" ? updater(current.data) : updater })), []);
  return { ...state, reload, setData };
};
