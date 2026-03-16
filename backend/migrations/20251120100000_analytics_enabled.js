import { migrate as logger } from "../logger.js";

const migrateName = "analytics-enabled-flag";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.table("proxy_host", (table) => {
			table.integer("analytics_enabled").notNull().unsigned().defaultTo(1);
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host analytics_enabled column added`);
			return knex.schema.table("redirection_host", (table) => {
				table.integer("analytics_enabled").notNull().unsigned().defaultTo(1);
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] redirection_host analytics_enabled column added`);
			return knex.schema.table("dead_host", (table) => {
				table.integer("analytics_enabled").notNull().unsigned().defaultTo(1);
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] dead_host analytics_enabled column added`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema
		.table("proxy_host", (table) => {
			table.dropColumn("analytics_enabled");
		})
		.then(() => {
			return knex.schema.table("redirection_host", (table) => {
				table.dropColumn("analytics_enabled");
			});
		})
		.then(() => {
			return knex.schema.table("dead_host", (table) => {
				table.dropColumn("analytics_enabled");
			});
		});
};

export { up, down };
