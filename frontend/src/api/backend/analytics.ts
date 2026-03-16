import * as api from "./base";

export interface Analytics {
	id: number;
	createdOn: string;
	proxyHostId: number;
	redirectionHostId: number;
	deadHostId: number;
	hostType: "proxy" | "redirection" | "dead";
	domainName: string;
	clientIp: string;
	userAgent: string;
	referer: string;
	requestMethod: string;
	requestUri: string;
	statusCode: number;
	responseTime: number;
	bytesSent: number;
	countryCode: string;
	meta: Record<string, any>;
}

export interface AnalyticsStats {
	totalVisits: number;
	uniqueVisitors: number;
	topPages: Array<{ requestUri: string; domainName: string; visits: number }>;
	topReferers: Array<{ referer: string; visits: number }>;
	trafficByHour: Array<{ hour: string; visits: number }>;
	statusCodes: Array<{ statusCode: number; count: number }>;
	topUserAgents: Array<{ userAgent: string; visits: number }>;
	topCountries: Array<{ countryCode: string; visits: number }>;
}

export interface AnalyticsParams {
	[key: string]: string | number | boolean | undefined;
	proxyHostId?: number;
	redirectionHostId?: number;
	deadHostId?: number;
	hostType?: "proxy" | "redirection" | "dead";
	domainName?: string;
	clientIp?: string;
	dateFrom?: string;
	dateTo?: string;
	limit?: number;
	offset?: number;
	expand?: string;
}

export async function getAnalytics(params?: AnalyticsParams): Promise<Analytics[]> {
	return await api.get({
		url: "/analytics",
		params,
	});
}

export async function getAnalyticsCount(params?: AnalyticsParams): Promise<{ count: number }> {
	return await api.get({
		url: "/analytics/count",
		params,
	});
}

export async function getAnalyticsStats(params?: AnalyticsParams): Promise<AnalyticsStats> {
	return await api.get({
		url: "/analytics/stats",
		params,
	});
}

export async function getAnalyticsByHost(
	hostType: "proxy" | "redirection" | "dead",
	hostId: number,
	params?: AnalyticsParams
): Promise<Analytics[]> {
	return await api.get({
		url: `/analytics/${hostType}/${hostId}`,
		params,
	});
}

export async function recordAnalytics(data: Partial<Analytics>): Promise<Analytics> {
	return await api.post({
		url: "/analytics",
		data,
	});
}
