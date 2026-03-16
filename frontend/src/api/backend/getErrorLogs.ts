import * as api from "./base";
import type { ErrorLogExpansion } from "./expansions";
import type { ErrorLog } from "./models";

export async function getErrorLogs(expand?: ErrorLogExpansion[], params = {}): Promise<ErrorLog[]> {
	return await api.get({
		url: "/error-log",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}

export async function getErrorLog(id: number, expand?: ErrorLogExpansion[]): Promise<ErrorLog> {
	return await api.get({
		url: `/error-log/${id}`,
		params: {
			expand: expand?.join(","),
		},
	});
}
