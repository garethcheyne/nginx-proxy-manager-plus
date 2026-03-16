import express from "express";
import internalAnalytics from "../internal/analytics.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import validator from "../lib/validator/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * GET /api/analytics
 * Get all analytics entries
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						proxyHostId: { type: "number" },
						redirectionHostId: { type: "number" },
						deadHostId: { type: "number" },
						hostType: { type: "string", enum: ["proxy", "redirection", "dead"] },
						domainName: { type: "string" },
						clientIp: { type: "string" },
						dateFrom: { type: "string" },
						dateTo: { type: "string" },
						limit: { type: "number", minimum: 1, maximum: 1000 },
						offset: { type: "number", minimum: 0 },
						expand: { type: "string" },
					},
				},
				req.query
			);
			const result = await internalAnalytics.getAll(res.locals.access, data);
			res.status(200).send(result);
		} catch (err) {
			next(err);
		}
	});

/**
 * GET /api/analytics/count
 * Get count of analytics entries
 */
router
	.route("/count")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						proxyHostId: { type: "number" },
						hostType: { type: "string", enum: ["proxy", "redirection", "dead"] },
						domainName: { type: "string" },
						dateFrom: { type: "string" },
						dateTo: { type: "string" },
					},
				},
				req.query
			);
			const count = await internalAnalytics.getCount(res.locals.access, data);
			res.status(200).send({ count });
		} catch (err) {
			next(err);
		}
	});

/**
 * GET /api/analytics/stats
 * Get aggregated analytics statistics
 */
router
	.route("/stats")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						proxyHostId: { type: "number" },
						hostType: { type: "string", enum: ["proxy", "redirection", "dead"] },
						dateFrom: { type: "string" },
						dateTo: { type: "string" },
					},
				},
				req.query
			);
			const stats = await internalAnalytics.getStats(res.locals.access, data);
			res.status(200).send(stats);
		} catch (err) {
			next(err);
		}
	});

/**
 * GET /api/analytics/:hostType/:hostId
 * Get analytics for a specific host
 */
router
	.route("/:hostType/:hostId")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const paramsData = await validator(
				{
					additionalProperties: false,
					properties: {
						hostType: { type: "string", enum: ["proxy", "redirection", "dead"] },
						hostId: { type: "number" },
					},
				},
				req.params
			);
			const queryData = await validator(
				{
					additionalProperties: false,
					properties: {
						dateFrom: { type: "string" },
						dateTo: { type: "string" },
						limit: { type: "number", minimum: 1, maximum: 1000 },
						offset: { type: "number", minimum: 0 },
					},
				},
				req.query
			);
			const result = await internalAnalytics.getByHost(
				res.locals.access,
				paramsData.hostType,
				paramsData.hostId,
				queryData
			);
			res.status(200).send(result);
		} catch (err) {
			next(err);
		}
	});

/**
 * POST /api/analytics
 * Record a new analytics entry (typically called by log processor)
 */
router
	.route("/record")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						proxyHostId: { type: "number" },
						redirectionHostId: { type: "number" },
						deadHostId: { type: "number" },
						hostType: { type: "string", enum: ["proxy", "redirection", "dead"] },
						domainName: { type: "string" },
						clientIp: { type: "string" },
						userAgent: { type: "string" },
						referer: { type: "string" },
						requestMethod: { type: "string" },
						requestUri: { type: "string" },
						statusCode: { type: "number" },
						responseTime: { type: "number" },
						bytesSent: { type: "number" },
						countryCode: { type: "string" },
						meta: { type: "object" },
					},
					required: ["hostType", "domainName", "clientIp", "statusCode"],
				},
				req.body
			);
			const result = await internalAnalytics.record(data);
			res.status(201).send(result);
		} catch (err) {
			next(err);
		}
	});

export default router;
