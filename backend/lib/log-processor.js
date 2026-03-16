import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { Tail } from "tail";
import internalAnalytics from "../internal/analytics.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import deadHostModel from "../models/dead_host.js";
import { debug, nginx as logger } from "../logger.js";

/**
 * Parse nginx log line in combined format
 * Log format: $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" "$host" $request_time
 */
const parseLogLine = (line) => {
	// Extended nginx log format regex
	const regex =
		/^(\S+) - (\S+) \[([^\]]+)\] "([A-Z]+) ([^\s]+) HTTP\/[^"]+" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)" (\S+)/;
	const match = line.match(regex);

	if (!match) {
		return null;
	}

	return {
		client_ip: match[1],
		remote_user: match[2],
		time_local: match[3],
		request_method: match[4],
		request_uri: match[5],
		status_code: Number.parseInt(match[6], 10),
		bytes_sent: Number.parseInt(match[7], 10),
		referer: match[8] === "-" ? "" : match[8],
		user_agent: match[9] === "-" ? "" : match[9],
		host: match[10],
		response_time: Math.round(Number.parseFloat(match[11]) * 1000), // Convert to milliseconds
	};
};

/**
 * Extract host ID from log file path
 * Example: /data/logs/proxy-host-5_access.log -> { type: 'proxy', id: 5 }
 */
const extractHostInfo = (filePath) => {
	const patterns = {
		proxy: /proxy-host-(\d+)_access\.log$/,
		redirection: /redirection-host-(\d+)_access\.log$/,
		dead: /dead-host-(\d+)_access\.log$/,
	};

	for (const [type, pattern] of Object.entries(patterns)) {
		const match = filePath.match(pattern);
		if (match) {
			return {
				type,
				id: Number.parseInt(match[1], 10),
			};
		}
	}

	return null;
};

/**
 * Get country code from IP (placeholder - integrate with GeoIP library)
 */
const getCountryFromIP = (ip) => {
	// TODO: Integrate with MaxMind GeoIP or similar
	// For now, return empty string
	return "";
};

/**
 * Check if analytics is enabled for a host
 */
const isAnalyticsEnabled = async (hostType, hostId) => {
	try {
		const modelMap = {
			proxy: proxyHostModel,
			redirection: redirectionHostModel,
			dead: deadHostModel,
		};

		const model = modelMap[hostType];
		if (!model) {
			return false;
		}

		const host = await model.query().findById(hostId).select("analytics_enabled");
		return host && host.analytics_enabled === true;
	} catch (err) {
		debug(logger, `Error checking analytics enabled for ${hostType} host ${hostId}:`, err.message);
		return false;
	}
};

/**
 * Process a log line and save to analytics
 */
const processLogLine = async (line, hostInfo) => {
	try {
		const logData = parseLogLine(line);
		if (!logData) {
			debug(logger, "Failed to parse log line:", line);
			return;
		}

		// Check if analytics is enabled for this host
		const analyticsEnabled = await isAnalyticsEnabled(hostInfo.type, hostInfo.id);
		if (!analyticsEnabled) {
			debug(logger, `Analytics disabled for ${hostInfo.type} host ${hostInfo.id}, skipping`);
			return;
		}

		const analyticsData = {
			host_type: hostInfo.type,
			domain_name: logData.host,
			client_ip: logData.client_ip,
			user_agent: logData.user_agent,
			referer: logData.referer,
			request_method: logData.request_method,
			request_uri: logData.request_uri,
			status_code: logData.status_code,
			response_time: logData.response_time,
			bytes_sent: logData.bytes_sent,
			country_code: getCountryFromIP(logData.client_ip),
			meta: {},
		};

		// Set the appropriate host ID
		if (hostInfo.type === "proxy") {
			analyticsData.proxy_host_id = hostInfo.id;
		} else if (hostInfo.type === "redirection") {
			analyticsData.redirection_host_id = hostInfo.id;
		} else if (hostInfo.type === "dead") {
			analyticsData.dead_host_id = hostInfo.id;
		}

		await internalAnalytics.record(analyticsData);
		debug(logger, `Analytics recorded for ${hostInfo.type} host ${hostInfo.id}`);
	} catch (err) {
		logger.error("Error processing log line:", err.message);
	}
};

/**
 * Watch a log file for new entries
 */
const watchLogFile = (filePath) => {
	const hostInfo = extractHostInfo(filePath);
	if (!hostInfo) {
		debug(logger, `Skipping non-host log file: ${filePath}`);
		return null;
	}

	logger.info(`Starting to watch log file: ${filePath} for ${hostInfo.type} host ${hostInfo.id}`);

	const tail = new Tail(filePath, {
		fromBeginning: false,
		follow: true,
		useWatchFile: true,
	});

	tail.on("line", (line) => {
		processLogLine(line, hostInfo);
	});

	tail.on("error", (error) => {
		logger.error(`Error watching ${filePath}:`, error);
	});

	return tail;
};

/**
 * Process existing log file (for historical data)
 */
const processExistingLog = async (filePath, limit = 1000) => {
	const hostInfo = extractHostInfo(filePath);
	if (!hostInfo) {
		return;
	}

	try {
		const content = await readFile(filePath, "utf8");
		const lines = content.split("\n").filter((line) => line.trim() !== "");

		// Process only the last N lines to avoid overloading on first run
		const linesToProcess = lines.slice(-limit);

		logger.info(`Processing ${linesToProcess.length} existing log lines from ${filePath}`);

		for (const line of linesToProcess) {
			await processLogLine(line, hostInfo);
		}

		logger.info(`Finished processing existing logs from ${filePath}`);
	} catch (err) {
		if (err.code !== "ENOENT") {
			logger.error(`Error processing existing log ${filePath}:`, err.message);
		}
	}
};

/**
 * Start watching all log files in the logs directory
 */
const startLogWatchers = () => {
	const logsDir = "/data/logs";
	const watchers = [];

	try {
		// Check if logs directory exists
		if (!fs.existsSync(logsDir)) {
			logger.warn(`Logs directory ${logsDir} does not exist. Analytics log watching disabled.`);
			return watchers;
		}

		const files = fs.readdirSync(logsDir);

		for (const file of files) {
			if (file.endsWith("_access.log")) {
				const filePath = `${logsDir}/${file}`;
				const watcher = watchLogFile(filePath);
				if (watcher) {
					watchers.push(watcher);
				}
			}
		}

		logger.info(`Started watching ${watchers.length} log files for analytics`);
	} catch (err) {
		logger.error("Error starting log watchers:", err.message);
	}

	return watchers;
};

/**
 * Stop all log watchers
 */
const stopLogWatchers = (watchers) => {
	for (const watcher of watchers) {
		try {
			watcher.unwatch();
		} catch (err) {
			logger.error("Error stopping log watcher:", err.message);
		}
	}
	logger.info("Stopped all log watchers");
};

export default {
	parseLogLine,
	extractHostInfo,
	processLogLine,
	isAnalyticsEnabled,
	watchLogFile,
	processExistingLog,
	startLogWatchers,
	stopLogWatchers,
};
