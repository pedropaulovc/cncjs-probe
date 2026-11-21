// Stands in for gSender's app/store (and lib/units' ../store): the parity test sets globalThis.__gsender.store.
const store = { get: (key, defaultValue) => globalThis.__gsender.store[key] ?? defaultValue };
export default store;
