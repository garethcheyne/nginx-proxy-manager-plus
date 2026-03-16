import _ from "lodash";
import analyticsModel from "../models/analytics.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import deadHostModel from "../models/dead_host.js";

const internalAnalytics = {
	/**
	 * Record a visitor analytics entry
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	record: (data) => {
		const analyticsData = {
			proxy_host_id: data.proxy_host_id || 0,
			redirection_host_id: data.redirection_host_id || 0,
			dead_host_id: data.dead_host_id || 0,
			host_type: data.host_type || "proxy",
			domain_name: data.domain_name || "",
			client_ip: data.client_ip || "",
			user_agent: data.user_agent || "",
			referer: data.referer || "",
			request_method: data.request_method || "GET",
			request_uri: data.request_uri || "/",
			status_code: data.status_code || 200,
			response_time: data.response_time || 0,
			bytes_sent: data.bytes_sent || 0,
			country_code: data.country_code || "",
			meta: data.meta || {},
		};

		return analyticsModel.query().insert(analyticsData);
	},

	/**
	 * Get analytics with filters
	 * @param   {Access}  access
	 * @param   {Object}  criteria
	 * @returns {Promise}
	 */
	getAll: (access, criteria = {}) => {
		return access.can("analytics:list").then(() => {
			const query = analyticsModel.query().orderBy("created_on", "DESC");

			// Filters
			if (criteria.proxy_host_id) {
				query.where("proxy_host_id", criteria.proxy_host_id);
			}

			if (criteria.redirection_host_id) {
				query.where("redirection_host_id", criteria.redirection_host_id);
			}

			if (criteria.dead_host_id) {
				query.where("dead_host_id", criteria.dead_host_id);
			}

			if (criteria.host_type) {
				query.where("host_type", criteria.host_type);
			}

			if (criteria.domain_name) {
				query.where("domain_name", criteria.domain_name);
			}

			if (criteria.client_ip) {
				query.where("client_ip", criteria.client_ip);
			}

			if (criteria.date_from) {
				query.where("created_on", ">=", criteria.date_from);
			}

			if (criteria.date_to) {
				query.where("created_on", "<=", criteria.date_to);
			}

			// Pagination
			const limit = criteria.limit || 100;
			const offset = criteria.offset || 0;
			query.limit(limit).offset(offset);

			// Expand relations
			if (criteria.expand) {
				const expansions = criteria.expand.split(",").map((s) => s.trim());
				if (expansions.includes("proxy_host")) {
					query.withGraphFetched("proxy_host");
				}
				if (expansions.includes("redirection_host")) {
					query.withGraphFetched("redirection_host");
				}
				if (expansions.includes("dead_host")) {
					query.withGraphFetched("dead_host");
				}
			}

			return query;
		});
	},

	/**
	 * Get analytics count
	 * @param   {Access}  access
	 * @param   {Object}  criteria
	 * @returns {Promise}
	 */
	getCount: (access, criteria = {}) => {
		return access.can("analytics:list").then(() => {
			const query = analyticsModel.query();

			// Apply same filters as getAll
			if (criteria.proxy_host_id) {
				query.where("proxy_host_id", criteria.proxy_host_id);
			}

			if (criteria.host_type) {
				query.where("host_type", criteria.host_type);
			}

			if (criteria.domain_name) {
				query.where("domain_name", criteria.domain_name);
			}

			if (criteria.date_from) {
				query.where("created_on", ">=", criteria.date_from);
			}

			if (criteria.date_to) {
				query.where("created_on", "<=", criteria.date_to);
			}

			return query.count("* as count").first().then((result) => result.count);
		});
	},

	/**
	 * Get aggregated statistics
	 * @param   {Access}  access
	 * @param   {Object}  criteria
	 * @returns {Promise}
	 */
	getStats: (access, criteria = {}) => {
		return access.can("analytics:list").then(async () => {
			const baseQuery = analyticsModel.query();

			// Apply date filters
			if (criteria.date_from) {
				baseQuery.where("created_on", ">=", criteria.date_from);
			}

			if (criteria.date_to) {
				baseQuery.where("created_on", "<=", criteria.date_to);
			}

			if (criteria.proxy_host_id) {
				baseQuery.where("proxy_host_id", criteria.proxy_host_id);
			}

			if (criteria.host_type) {
				baseQuery.where("host_type", criteria.host_type);
			}

			// Total visits
			const totalVisits = await baseQuery
				.clone()
				.count("* as count")
				.first()
				.then((result) => Number.parseInt(result.count, 10));

			// Unique visitors (by IP)
			const uniqueVisitors = await baseQuery
				.clone()
				.countDistinct("client_ip as count")
				.first()
				.then((result) => Number.parseInt(result.count, 10));

			// Top pages
			const topPages = await baseQuery
				.clone()
				.select("request_uri", "domain_name")
				.count("* as visits")
				.groupBy("request_uri", "domain_name")
				.orderBy("visits", "DESC")
				.limit(10);

			// Top referers
			const topReferers = await baseQuery
				.clone()
				.select("referer")
				.count("* as visits")
				.whereNot("referer", "")
				.groupBy("referer")
				.orderBy("visits", "DESC")
				.limit(10);

			// Traffic by hour (last 24 hours)
			const trafficByHour = await baseQuery
				.clone()
				.select(analyticsModel.raw("strftime('%Y-%m-%d %H:00:00', created_on) as hour"))
				.count("* as visits")
				.groupBy("hour")
				.orderBy("hour", "DESC")
				.limit(24);

			// Status code distribution
			const statusCodes = await baseQuery
				.clone()
				.select("status_code")
				.count("* as count")
				.groupBy("status_code")
				.orderBy("count", "DESC");

			// Top user agents (browsers/devices)
			const topUserAgents = await baseQuery
				.clone()
				.select("user_agent")
				.count("* as visits")
				.whereNot("user_agent", "")
				.groupBy("user_agent")
				.orderBy("visits", "DESC")
				.limit(10);

			// Countries
			const topCountries = await baseQuery
				.clone()
				.select("country_code")
				.count("* as visits")
				.whereNot("country_code", "")
				.groupBy("country_code")
				.orderBy("visits", "DESC")
				.limit(10);

			return {
				total_visits: totalVisits,
				unique_visitors: uniqueVisitors,
				top_pages: topPages,
				top_referers: topReferers,
				traffic_by_hour: trafficByHour,
				status_codes: statusCodes,
				top_user_agents: topUserAgents,
				top_countries: topCountries,
			};
		});
	},

	/**
	 * Delete old analytics data
	 * @param   {Number}  daysToKeep
	 * @returns {Promise}
	 */
	cleanup: (daysToKeep = 90) => {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

		return analyticsModel.query().where("created_on", "<", cutoffDate.toISOString()).delete();
	},

	/**
	 * Get analytics for a specific host
	 * @param   {Access}  access
	 * @param   {String}  hostType  - 'proxy', 'redirection', or 'dead'
	 * @param   {Number}  hostId
	 * @param   {Object}  criteria
	 * @returns {Promise}
	 */
	getByHost: (access, hostType, hostId, criteria = {}) => {
		return access.can("analytics:list").then(() => {
			const fieldMap = {
				proxy: "proxy_host_id",
				redirection: "redirection_host_id",
				dead: "dead_host_id",
			};

			const field = fieldMap[hostType];
			if (!field) {
				throw new Error(`Invalid host type: ${hostType}`);
			}

			criteria[field] = hostId;
			criteria.host_type = hostType;

			return internalAnalytics.getAll(access, criteria);
		});
	},
};

export default internalAnalytics;
