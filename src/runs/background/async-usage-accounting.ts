export const ASYNC_USAGE_ACCOUNTING_ENTRY_TYPE = "subagent-async-usage";
export const ASYNC_USAGE_ACCOUNTING_VERSION = 1;

export type AsyncUsageMetrics = {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	cost?: number;
	turns?: number;
};

export type AsyncTotalCostMetrics = {
	inputTokens?: number;
	outputTokens?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	costUsd?: number;
};

export type AsyncUsageAccountingResult = {
	resultId: string;
	agent?: string;
	provider?: string;
	model?: string;
	requestedModel?: string;
	thinking?: string | boolean;
	sessionFile?: string;
	usage?: AsyncUsageMetrics;
	totalCost?: AsyncTotalCostMetrics;
};

export type AsyncUsageAccountingEntry = {
	version: typeof ASYNC_USAGE_ACCOUNTING_VERSION;
	runId: string;
	results: AsyncUsageAccountingResult[];
};

type RawAccountingResult = {
	runId?: string;
	workflowKey?: string;
	agent?: unknown;
	provider?: unknown;
	model?: unknown;
	requestedModel?: unknown;
	thinking?: unknown;
	sessionFile?: unknown;
	usage?: unknown;
	totalCost?: unknown;
};

function numericFields<T extends Record<string, number>>(value: unknown, keys: readonly (keyof T)[]): T | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const source = value as Record<string, unknown>;
	const result: Record<string, number> = {};
	for (const key of keys) {
		const field = source[key as string];
		if (typeof field === "number" && Number.isFinite(field)) result[key as string] = field;
	}
	return Object.keys(result).length ? result as T : undefined;
}

export function persistAsyncUsageAccountingEntry(input: {
	entry: AsyncUsageAccountingEntry;
	sourceSessionId: string;
	currentSessionId: string | null | undefined;
	branch: readonly { type: string; customType?: string; data?: unknown }[];
	ownsSourceSession: (sessionId: string) => boolean;
	appendEntry: (customType: string, data: AsyncUsageAccountingEntry) => void;
}): boolean {
	if (!input.currentSessionId || !input.ownsSourceSession(input.sourceSessionId)) return false;
	if (input.branch.some((item) => item.type === "custom" && item.customType === ASYNC_USAGE_ACCOUNTING_ENTRY_TYPE
		&& (item.data as { runId?: unknown } | undefined)?.runId === input.entry.runId)) return true;
	input.appendEntry(ASYNC_USAGE_ACCOUNTING_ENTRY_TYPE, input.entry);
	return true;
}

export function buildAsyncUsageAccountingEntry(runId: string, results: readonly RawAccountingResult[] | undefined): AsyncUsageAccountingEntry | undefined {
	if (!runId) return undefined;
	const projected = (results ?? []).map((result, index): AsyncUsageAccountingResult | undefined => {
		const usage = numericFields<AsyncUsageMetrics>(result.usage, ["input", "output", "cacheRead", "cacheWrite", "cost", "turns"]);
		const totalCost = numericFields<AsyncTotalCostMetrics>(result.totalCost, ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "costUsd"]);
		if (!usage && !totalCost) return undefined;
		const resultId = result.runId || result.workflowKey || `${runId}:result:${index}`;
		return {
			resultId,
			...(typeof result.agent === "string" ? { agent: result.agent } : {}),
			...(typeof result.provider === "string" ? { provider: result.provider } : {}),
			...(typeof result.model === "string" ? { model: result.model } : {}),
			...(typeof result.requestedModel === "string" ? { requestedModel: result.requestedModel } : {}),
			...(typeof result.thinking === "string" || typeof result.thinking === "boolean" ? { thinking: result.thinking } : {}),
			...(typeof result.sessionFile === "string" ? { sessionFile: result.sessionFile } : {}),
			...(usage ? { usage } : {}),
			...(totalCost ? { totalCost } : {}),
		};
	}).filter((result): result is AsyncUsageAccountingResult => result !== undefined);
	return projected.length ? { version: ASYNC_USAGE_ACCOUNTING_VERSION, runId, results: projected } : undefined;
}
