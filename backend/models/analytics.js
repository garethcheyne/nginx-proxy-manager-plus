import { Model } from "objection";
import now from "./now_helper.js";
import ProxyHost from "./proxy_host.js";
import RedirectionHost from "./redirection_host.js";
import DeadHost from "./dead_host.js";

export default class Analytics extends Model {
	$beforeInsert() {
		this.created_on = now();
	}

	static get name() {
		return "Analytics";
	}

	static get tableName() {
		return "analytics";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			proxy_host: {
				relation: Model.HasOneRelation,
				modelClass: ProxyHost,
				join: {
					from: "analytics.proxy_host_id",
					to: "proxy_host.id",
				},
				filter: (qb) => {
					qb.where("proxy_host.is_deleted", 0);
				},
			},
			redirection_host: {
				relation: Model.HasOneRelation,
				modelClass: RedirectionHost,
				join: {
					from: "analytics.redirection_host_id",
					to: "redirection_host.id",
				},
				filter: (qb) => {
					qb.where("redirection_host.is_deleted", 0);
				},
			},
			dead_host: {
				relation: Model.HasOneRelation,
				modelClass: DeadHost,
				join: {
					from: "analytics.dead_host_id",
					to: "dead_host.id",
				},
				filter: (qb) => {
					qb.where("dead_host.is_deleted", 0);
				},
			},
		};
	}
}
