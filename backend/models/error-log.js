import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

class ErrorLog extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();

		if (typeof this.meta === "undefined") {
			this.meta = {};
		}
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	static get name() {
		return "ErrorLog";
	}

	static get tableName() {
		return "error_log";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			user: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "error_log.user_id",
					to: "user.id",
				},
			},
		};
	}
}

export default ErrorLog;
