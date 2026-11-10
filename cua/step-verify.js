'use strict';

/**
 * Result-oriented verification. A new screenshot path is NOT evidence that
 * an application performed the requested operation.
 *
 * A mutating step requires an explicit, observable postcondition. Missing
 * evidence yields "unknown", never "verified".
 */
const READ_ACTIONS = new Set(['observe', 'list', 'snapshot', 'ad-snapshot']);

function contains(source, needle) {
  return String(source || '').toLowerCase().includes(String(needle).toLowerCase());
}

function verifyStep(step, before, after, result) {
  const action = String(step && step.action || '').toLowerCase();
  if (!result || result.ok !== true) {
    return { status: 'failed', reason: 'DRIVER_DID_NOT_SUCCEED', checks: [] };
  }
  if (!after || typeof after !== 'object') {
    return { status: 'unknown', reason: 'POST_OBSERVATION_MISSING', checks: [] };
  }

  if (READ_ACTIONS.has(action)) {
    const observed = !!(after.channels && Object.values(after.channels).some(Boolean))
      || Array.isArray(after.windows);
    return { status: observed ? 'verified' : 'unknown', reason: observed ? 'READ_OBSERVED' : 'READ_NO_EVIDENCE', checks: [] };
  }

  const expected = step && step.expect;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    return { status: 'unknown', reason: 'POSTCONDITION_REQUIRED', checks: [] };
  }

  const checks = [];
  if (typeof expected.windowTitleIncludes === 'string' && expected.windowTitleIncludes.trim()) {
    const windows = Array.isArray(after.windows) ? after.windows : null;
    checks.push({
      kind: 'windowTitleIncludes',
      observed: !!windows,
      pass: !!windows && windows.some(w => contains(w.title, expected.windowTitleIncludes)),
    });
  }
  if (typeof expected.focusNameIncludes === 'string' && expected.focusNameIncludes.trim()) {
    const focus = after.focus && after.focus.Name;
    checks.push({
      kind: 'focusNameIncludes',
      observed: typeof focus === 'string',
      pass: typeof focus === 'string' && contains(focus, expected.focusNameIncludes),
    });
  }
  if (typeof expected.agentDesktopIncludes === 'string' && expected.agentDesktopIncludes.trim()) {
    const snapshot = after.agentDesktop;
    checks.push({
      kind: 'agentDesktopIncludes',
      observed: typeof snapshot === 'string',
      pass: typeof snapshot === 'string' && contains(snapshot, expected.agentDesktopIncludes),
    });
  }

  if (checks.length === 0) {
    return { status: 'unknown', reason: 'NO_SUPPORTED_POSTCONDITION', checks };
  }
  if (checks.some(c => !c.observed)) {
    return { status: 'unknown', reason: 'POSTCONDITION_NOT_OBSERVABLE', checks };
  }
  if (checks.some(c => !c.pass)) {
    return { status: 'not-verified', reason: 'POSTCONDITION_MISMATCH', checks };
  }
  return { status: 'verified', reason: 'POSTCONDITION_MATCH', checks };
}

module.exports = { verifyStep };
