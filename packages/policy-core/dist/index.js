/**
 * The rule evaluation engine.
 * Takes a tool call (what the agent wants to do) and a list of rules,
 * returns allow / block / review.
 *
 * Rules are checked in priority order (highest first).
 * First matching rule wins.
 * No matching rule = BLOCK (fail closed — the core security guarantee).
 */
export function readField(call, path) {
    const parts = path.split(".");
    let current = {
        tool_name: call.tool_name,
        tool_input: call.tool_input,
        project_id: call.project_id,
    };
    for (const part of parts) {
        if (typeof current !== "object" || current === null)
            return undefined;
        current = current[part];
    }
    return current;
}
function matchesSingle(call, cond) {
    const raw = readField(call, cond.field);
    const actual = raw === undefined || raw === null ? "" : String(raw);
    const expected = cond.value;
    switch (cond.op) {
        case "equals":
            return actual.toLowerCase() === expected.toLowerCase();
        case "contains":
            return actual.toLowerCase().includes(expected.toLowerCase());
        case "not_contains":
            return !actual.toLowerCase().includes(expected.toLowerCase());
        case "starts_with":
            return actual.toLowerCase().startsWith(expected.toLowerCase());
        case "regex":
            try {
                return new RegExp(expected, "i").test(actual);
            }
            catch {
                return false;
            }
        case "lt":
            return Number(actual) < Number(expected);
        case "gt":
            return Number(actual) > Number(expected);
        case "lte":
            return Number(actual) <= Number(expected);
        case "gte":
            return Number(actual) >= Number(expected);
        default:
            return false;
    }
}
export function matchesCondition(call, condition) {
    if (Array.isArray(condition)) {
        // AND: all must match
        return condition.every((c) => matchesSingle(call, c));
    }
    return matchesSingle(call, condition);
}
export function parseCondition(raw) {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed;
    }
    catch {
        return null;
    }
}
// --- Main evaluation ---
export function evaluate(call, rules) {
    // Sort by priority descending — highest priority first
    const sorted = [...rules]
        .filter((r) => r.priority !== undefined)
        .sort((a, b) => b.priority - a.priority);
    for (const rule of sorted) {
        const condition = rule.condition ?? parseCondition(rule.condition_json ?? null);
        // No condition = matches everything
        if (!condition) {
            return {
                effect: rule.effect,
                reason: rule.name,
                matched_rule_id: rule.id,
            };
        }
        if (matchesCondition(call, condition)) {
            return {
                effect: rule.effect,
                reason: rule.name,
                matched_rule_id: rule.id,
            };
        }
    }
    // FAIL CLOSED — no rule matched, block by default.
    // This is the core security guarantee: an unknown action is never allowed.
    return {
        effect: "block",
        reason: "No matching rule — blocked by default (fail closed)",
        matched_rule_id: null,
    };
}
/**
 * Keep rules that are org-wide (no project) or scoped to the given project.
 * Mirrors the control-plane SQL: (project_id IS NULL OR project_id = ?).
 */
export function applyProjectFilter(rules, project_id) {
    return rules.filter((r) => r.project_id == null || r.project_id === project_id);
}
