// What CNCjs last reported about the machine, in the shape gSender's redux store
// keeps it (`controller.settings`, `controller.mpos`), so the ported soft-limit and
// tool-length code reads it the way upstream does. The widget writes it from
// CNCjs's controller:settings and controller:state events.
let state = {
    controller: {
        settings: { settings: {} },
        mpos: {},
    },
};

export const getState = () => state;

export const setControllerSettings = (settings) => {
    state = { controller: { ...state.controller, settings: settings || { settings: {} } } };
};

export const setMachinePosition = (mpos) => {
    state = { controller: { ...state.controller, mpos: mpos || {} } };
};

// Stands in for lodash/get, which the ported modules use to read this store.
export const get = (object, path, defaultValue) => {
    const value = path
        .split('.')
        .reduce((node, key) => (node == null ? undefined : node[key]), object);
    return value === undefined ? defaultValue : value;
};
