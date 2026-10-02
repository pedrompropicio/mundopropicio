/** Mock encadeável do cliente Supabase: qualquer cadeia resolve para vazio. */
export const supabaseCalls: string[] = [];
function chain(table: string): any {
  const result = { data: [] as any[], error: null, count: 0 };
  const p: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve(result).then(res, rej);
      if (prop === "maybeSingle" || prop === "single")
        return () => Promise.resolve({ data: null, error: null });
      return () => p;
    },
    apply() { return p; },
  });
  return p;
}
export const supabaseMock = {
  from: (table: string) => { supabaseCalls.push(table); return chain(table); },
  rpc: (fn: string) => { supabaseCalls.push(`rpc:${fn}`); return chain(fn); },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
  removeChannel: () => {},
  auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
};
