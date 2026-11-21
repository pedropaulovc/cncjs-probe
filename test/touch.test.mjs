// The fix over gSender: a toolsetter (Pn:T) is a touch, like the probe (Pn:P).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOUCH_LABELS, connectivityAfter, touchFromPinState } from '../web/lib/touch.js';
import { canClick } from '../web/lib/probe-options.js';

test('CNCjs pin state strings say which input is touching', () => {
    assert.equal(touchFromPinState('P'), 'probe');
    assert.equal(touchFromPinState('T'), 'toolsetter');
    assert.equal(touchFromPinState('PT'), 'both');
    assert.equal(touchFromPinState('TP'), 'both');
    // other pins in the same report do not count
    assert.equal(touchFromPinState('XYZ'), 'none');
    assert.equal(touchFromPinState('XZT'), 'toolsetter');
    assert.equal(touchFromPinState('PXH'), 'probe');
    assert.equal(touchFromPinState(''), 'none');
});

test('gSender pin state objects are read the same way', () => {
    assert.equal(touchFromPinState({ P: true }), 'probe');
    assert.equal(touchFromPinState({ T: true }), 'toolsetter');
    assert.equal(touchFromPinState({ P: true, T: true }), 'both');
    assert.equal(touchFromPinState({ P: false, T: false, X: true }), 'none');
    assert.equal(touchFromPinState({}), 'none');
});

test('no pin state at all is no touch', () => {
    assert.equal(touchFromPinState(undefined), 'none');
    assert.equal(touchFromPinState(null), 'none');
    assert.equal(touchFromPinState(0), 'none');
});

test('the indicator names the input that fired', () => {
    assert.match(TOUCH_LABELS[touchFromPinState('P')], /Probe/);
    assert.match(TOUCH_LABELS[touchFromPinState('T')], /Toolsetter/);
    assert.doesNotMatch(TOUCH_LABELS[touchFromPinState('T')], /Probe/);
    assert.equal(TOUCH_LABELS[touchFromPinState('')], 'No touch');
});

test('with the connection test on, a toolsetter touch alone confirms the circuit and enables Start', () => {
    const connectivity = connectivityAfter({ connectivityTest: true, confirmed: 'waiting', touch: touchFromPinState('T') });
    assert.equal(connectivity, 'confirmed');
    const startEnabled = connectivity === 'confirmed' && canClick({ connected: true, workflowState: 'idle', type: 'Grbl', activeState: 'Idle' });
    assert.equal(startEnabled, true);
});

test('with the connection test on, Start waits for a touch; with it off it does not', () => {
    assert.equal(connectivityAfter({ connectivityTest: true, confirmed: 'waiting', touch: 'none' }), 'waiting');
    assert.equal(connectivityAfter({ connectivityTest: false, confirmed: 'waiting', touch: 'none' }), 'confirmed');
});

test('a confirmed circuit stays confirmed after the touch ends, as in gSender', () => {
    let connectivity = connectivityAfter({ connectivityTest: true, confirmed: 'waiting', touch: touchFromPinState('P') });
    connectivity = connectivityAfter({ connectivityTest: true, confirmed: connectivity, touch: touchFromPinState('') });
    assert.equal(connectivity, 'confirmed');
});

test('Run needs an open port, an idle Grbl controller and no running program', () => {
    const ok = { connected: true, workflowState: 'idle', type: 'Grbl', activeState: 'Idle' };
    assert.equal(canClick(ok), true);
    assert.equal(canClick({ ...ok, type: 'grblHAL' }), true);
    assert.equal(canClick({ ...ok, connected: false }), false);
    assert.equal(canClick({ ...ok, workflowState: 'running' }), false);
    assert.equal(canClick({ ...ok, type: 'Marlin' }), false);
    assert.equal(canClick({ ...ok, activeState: 'Run' }), false);
    assert.equal(canClick({ ...ok, activeState: 'Alarm' }), false);
});
