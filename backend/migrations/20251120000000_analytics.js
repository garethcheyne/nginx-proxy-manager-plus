import { migrate as logger } from "../logger.js";

const migrateName = "analytics";

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
		.createTable("analytics", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.integer("proxy_host_id").unsigned().defaultTo(0);
			table.integer("redirection_host_id").unsigned().defaultTo(0);
			table.integer("dead_host_id").unsigned().defaultTo(0);
			table.string("host_type", 50).notNull(); // 'proxy', 'redirection', 'dead'
			table.string("domain_name", 255).notNull();
			table.string("client_ip", 100).notNull();
			table.text("user_agent").notNull().defaultTo("");
			table.string("referer", 1000).notNull().defaultTo("");
			table.string("request_method", 10).notNull().defaultTo("GET");
			table.string("request_uri", 2000).notNull().defaultTo("");
			table.integer("status_code").unsigned().notNull();
			table.integer("response_time").unsigned().defaultTo(0); // in milliseconds
			table.bigInteger("bytes_sent").unsigned().defaultTo(0);
			table.string("country_code", 2).notNull().defaultTo("");
			table.json("meta").notNull();
			
			// Indexes for better query performance
			table.index("proxy_host_id");
			table.index("created_on");
			table.index(["host_type", "created_on"]);
			table.index("client_ip");
			table.index("domain_name");
		})
		.then(() => {
			logger.info(`[${migrateName}] analytics Table created`);
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
	return knex.schema.dropTable("analytics");
};

export { up, down };
