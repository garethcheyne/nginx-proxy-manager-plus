import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import errorLogModel from "../models/error-log.js";

const internalErrorLog = {
	/**
	 * All error logs
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		await access.can("errorlog:list");

		const query = errorLogModel
			.query()
			.orderBy("created_on", "DESC")
			.orderBy("id", "DESC")
			.limit(200);

		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			query.where(function () {
				this.where("error_message", "like", `%${searchQuery}%`)
					.orWhere("request_path", "like", `%${searchQuery}%`)
					.orWhere("error_type", "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.allowGraph("[user]").withGraphFetched(`[${expand.join(", ")}]`);
		}

		return await query;
	},

	/**
	 * Single error log entry
	 *
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Integer}  data.id
	 * @param  {Array}    [data.expand]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		await access.can("errorlog:list");

		const query = errorLogModel
			.query()
			.andWhere("id", data.id)
			.first();

		if (typeof data.expand !== "undefined" && data.expand !== null) {
			query.allowGraph("[user]").withGraphFetched(`[${data.expand.join(", ")}]`);
		}

		const row = await query;

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		return row;
	},

	/**
	 * Add an error log entry. This is called from the error middleware
	 * and does NOT require access permission checks.
	 *
	 * @param   {Object}   data
	 * @param   {String}   data.error_message
	 * @param   {String}   [data.error_type]
	 * @param   {Number}   [data.error_code]
	 * @param   {String}   [data.stack_trace]
	 * @param   {String}   [data.request_method]
	 * @param   {String}   [data.request_path]
	 * @param   {String}   [data.request_ip]
	 * @param   {Number}   [data.user_id]
	 * @param   {Object}   [data.meta]
	 * @returns {Promise}
	 */
	add: async (data) => {
		if (!data.error_message) {
			return;
		}

		try {
			return await errorLogModel.query().insert({
				user_id: data.user_id || 0,
				error_type: data.error_type || "",
				error_code: data.error_code || 500,
				error_message: data.error_message,
				stack_trace: data.stack_trace || null,
				request_method: data.request_method || "",
				request_path: data.request_path || "",
				request_ip: data.request_ip || "",
				meta: data.meta || {},
			});
		} catch {
			// Silently fail - we don't want error logging to cause more errors
		}
	},
};

export default internalErrorLog;
