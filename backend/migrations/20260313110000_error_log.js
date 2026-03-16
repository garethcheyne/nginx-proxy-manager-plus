import { migrate as logger } from "../logger.js";

const migrateName = "error_log";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.createTable("error_log", (table) => {
		table.increments().primary();
		table.dateTime("created_on").notNull();
		table.dateTime("modified_on").notNull();
		table.integer("user_id").notNull().unsigned().defaultTo(0);
		table.string("error_type").notNull().defaultTo("");
		table.integer("error_code").notNull().unsigned().defaultTo(500);
		table.text("error_message").notNull();
		table.text("stack_trace").nullable();
		table.string("request_method", 10).notNull().defaultTo("");
		table.string("request_path", 512).notNull().defaultTo("");
		table.string("request_ip", 45).notNull().defaultTo("");
		table.json("meta").notNull();
	});

	logger.info(`[${migrateName}] error_log Table created`);
};

const down = async (knex) => {
	await knex.schema.dropTableIfExists("error_log");
	logger.info(`[${migrateName}] error_log Table dropped`);
};

export { up, down };
