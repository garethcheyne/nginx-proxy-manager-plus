import { useQuery } from "@tanstack/react-query";
import { type ErrorLog, type ErrorLogExpansion, getErrorLogs, getErrorLog } from "src/api/backend";

const useErrorLogs = (expand?: ErrorLogExpansion[], options = {}) => {
	return useQuery<ErrorLog[], Error>({
		queryKey: ["error-logs", { expand }],
		queryFn: () => getErrorLogs(expand),
		staleTime: 10 * 1000,
		...options,
	});
};

const useErrorLog = (id: number, options = {}) => {
	return useQuery<ErrorLog, Error>({
		queryKey: ["error-log", id],
		queryFn: () => getErrorLog(id, ["user"]),
		staleTime: 10 * 1000,
		...options,
	});
};

export { useErrorLogs, useErrorLog };
