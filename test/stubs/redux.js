// Stands in for gSender's app/store/redux: the parity test sets globalThis.__gsender.redux.
const store = { getState: () => globalThis.__gsender.redux };
export default store;
export { store };
