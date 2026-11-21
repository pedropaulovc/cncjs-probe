// Which probe input is touching, from a Grbl status report's pin state.
//
// gSender only reads the probe pin (`pinState.P`), so a FluidNC toolsetter, which
// reports `Pn:T`, never counts as a touch and its connection test never passes,
// although G38.2 stops on either input. Here either input is a touch.
//
// CNCjs 1.11.5 passes `Pn:` through as the raw letter string ("P", "T", "PT",
// "" when absent); gSender's server turns it into an object ({ P: true }).
// Both forms are accepted.

export const TOUCH_NONE = 'none';
export const TOUCH_PROBE = 'probe';
export const TOUCH_TOOLSETTER = 'toolsetter';
export const TOUCH_BOTH = 'both';

const pinsFrom = (pinState) => {
    if (typeof pinState === 'string') {
        return { P: pinState.includes('P'), T: pinState.includes('T') };
    }
    if (!pinState || typeof pinState !== 'object') {
        return { P: false, T: false };
    }
    return { P: Boolean(pinState.P), T: Boolean(pinState.T) };
};

// -> 'none' | 'probe' | 'toolsetter' | 'both'
export const touchFromPinState = (pinState) => {
    const { P, T } = pinsFrom(pinState);
    if (P && T) {
        return TOUCH_BOTH;
    }
    if (P) {
        return TOUCH_PROBE;
    }
    if (T) {
        return TOUCH_TOOLSETTER;
    }
    return TOUCH_NONE;
};

export const TOUCH_LABELS = {
    [TOUCH_NONE]: 'No touch',
    [TOUCH_PROBE]: 'Touch detected: Probe',
    [TOUCH_TOOLSETTER]: 'Touch detected: Toolsetter',
    [TOUCH_BOTH]: 'Touch detected: Probe and Toolsetter',
};

// gSender's RunProbe/startConnectivityTest: Start is allowed once the circuit has
// been seen closed, or straight away with the connection test turned off.
// `confirmed` latches: a touch that ends still counts. Returns 'confirmed' |
// 'waiting'.
export const connectivityAfter = ({ connectivityTest, confirmed, touch }) => {
    if (!connectivityTest) {
        return 'confirmed';
    }
    if (confirmed === 'confirmed') {
        return 'confirmed';
    }
    return touch === TOUCH_NONE ? 'waiting' : 'confirmed';
};
