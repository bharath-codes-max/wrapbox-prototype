/**
 * The rule evaluation engine.
 * Takes a tool call (what the agent wants to do) and a list of rules,
 * returns allow / block / review.
 *
 * Rules are checked in priority order (highest first).
 * First matching rule wins.
 * No matching rule = BLOCK (fail closed — the core security guarantee).
 */
export type Effect = "allow" | "block" | "review";
export interface Rule {
    id: string;
    name: string;
    effect: Effect;
    priority: number;
    condition: Condition | null;
}
export interface ToolCall {
    tool_name: string;
    tool_input: Record<string, unknown>;
    project_id?: string;
}
export interface Decision {
    effect: Effect;
    reason: string;
    matched_rule_id: string | null;
}
export type Op = "equals" | "contains" | "not_contains" | "starts_with" | "regex" | "lt" | "gt" | "lte" | "gte";
export interface SingleCondition {
    field: string;
    op: Op;
    value: string;
}
export type Condition = SingleCondition | SingleCondition[];
export declare function readField(call: ToolCall, path: string): unknown;
export declare function matchesCondition(call: ToolCall, condition: Condition): boolean;
export declare function parseCondition(raw: string | null): Condition | null;
export declare function evaluate(call: ToolCall, rules: Array<Rule & {
    condition_json?: string | null;
}>): Decision;
/**
 * Keep rules that are org-wide (no project) or scoped to the given project.
 * Mirrors the control-plane SQL: (project_id IS NULL OR project_id = ?).
 */
export declare function applyProjectFilter<T extends {
    project_id?: string | null;
}>(rules: T[], project_id?: string | null): T[];
