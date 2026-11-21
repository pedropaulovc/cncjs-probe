// Talking to CNCjs from inside its Custom Widget iframe.
//
// CNCjs puts its session token on the iframe URL and answers a `connect` message
// with { action: { type: 'change', payload: { port, controller } } } whenever the
// port changes (cncjs-conversational works the same way). For live state the
// widget joins that port's socket.io room like CNCjs's own client: socket.io
// 2.x is served by CNCjs at /socket.io/socket.io.js, the token goes in the
// handshake query, and `open` on a port that is already open only adds the
// socket to the port's listeners. The widget never closes a port, and only
// sends `open` for a port /api/controllers lists, so it does not open one.

// standalone: own tab or file; cncjs: served and framed by CNCjs; foreign: framed by CNCjs from another origin
export const embeddingOf = (win, token) => {
    if (win.parent === win || !token) {
        return 'standalone';
    }
    try {
        return win.parent.location.origin === win.location.origin ? 'cncjs' : 'foreign';
    } catch {
        return 'foreign';
    }
};

export async function cncjsApi(path, token, init = {}) {
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    // CNCjs answers JSON; anything else (a proxy sign-in page, a fallback route) is not CNCjs.
    const json = (res.headers.get('content-type') || '').includes('application/json');
    const body = json ? await res.json().catch(() => null) : null;
    if (!res.ok) throw new Error(body?.msg || `HTTP ${res.status}`);
    if (!json || body === null) throw new Error(`CNCjs did not answer ${path}.`);
    return body;
}

let ioLoading = null;
const loadSocketIo = () => {
    if (window.io) return Promise.resolve(window.io);
    if (ioLoading) return ioLoading;
    ioLoading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/socket.io/socket.io.js';
        script.addEventListener('load', () => resolve(window.io));
        script.addEventListener('error', () => {
            ioLoading = null;
            reject(new Error('CNCjs did not serve /socket.io/socket.io.js'));
        });
        document.head.append(script);
    });
    return ioLoading;
};

const EVENTS = [
    'serialport:open',
    'serialport:close',
    'controller:settings',
    'controller:state',
    'workflow:state',
    'feeder:status',
];

// Joins `port` and reports CNCjs events through onEvent(name, ...args) plus
// onEvent('link', 'connecting' | 'joined' | 'not-open' | 'error', message).
// Returns { command(cmd, ...args), close() }.
export function joinPort({ token, port, onEvent }) {
    let socket = null;
    let closed = false;

    const join = async () => {
        const controllers = await cncjsApi('/api/controllers', token, { signal: AbortSignal.timeout(5000) });
        const entry = Array.isArray(controllers) ? controllers.find((c) => c?.port === port) : null;
        if (closed) return;
        if (!entry) {
            onEvent('link', 'not-open', `${port} is not open in CNCjs.`);
            return;
        }
        // addConnection replays settings, state and feeder status, but not the workflow state
        if (entry.workflow?.state) onEvent('workflow:state', entry.workflow.state);
        const options = { controllerType: entry.controller?.type, baudrate: entry.baudrate, rtscts: entry.rtscts };
        socket.emit('open', port, options, (err) => {
            if (closed) return;
            if (err) {
                onEvent('link', 'error', `CNCjs refused to share ${port}: ${err.message || err}`);
                return;
            }
            onEvent('link', 'joined', '');
        });
    };

    onEvent('link', 'connecting', '');
    loadSocketIo()
        .then((io) => {
            if (closed) return;
            socket = io.connect('', { query: `token=${encodeURIComponent(token)}` });
            for (const name of EVENTS) socket.on(name, (...args) => onEvent(name, ...args));
            socket.on('connect', () => join().catch((error) => onEvent('link', 'error', error.message)));
            socket.on('connect_error', (error) => onEvent('link', 'error', `socket.io: ${error?.message || error}`));
            socket.on('disconnect', () => onEvent('link', 'connecting', ''));
        })
        .catch((error) => onEvent('link', 'error', error.message));

    return {
        command(cmd, ...args) {
            if (!socket) return false;
            socket.emit('command', port, cmd, ...args);
            return true;
        },
        close() {
            closed = true;
            if (socket) socket.disconnect();
            socket = null;
        },
    };
}
