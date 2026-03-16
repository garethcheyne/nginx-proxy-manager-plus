import express from "express";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, global as logger } from "../logger.js";
import internalBackup from "../internal/backup.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * GET /api/backup/metadata
 * Returns system info and record counts
 */
router
	.route("/metadata")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const metadata = await internalBackup.getMetadata(res.locals.access);
			res.status(200).send(metadata);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/backup/download
 * Creates and streams a full backup ZIP
 */
router
	.route("/download")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const result = await internalBackup.createBackup(res.locals.access);
			res.status(200).download(result.fileName);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/backup/restore
 * Accepts a backup ZIP upload and restores the system
 */
router
	.route("/restore")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			if (!req.files || !req.files.backup) {
				res.status(400).send({ error: "No backup file uploaded" });
				return;
			}

			const backupFile = req.files.backup;
			const tempPath = `/tmp/npm-upload-${Date.now()}.zip`;
			await backupFile.mv(tempPath);

			const result = await internalBackup.restoreBackup(res.locals.access, tempPath);

			// Clean up uploaded file
			const fs = await import("node:fs");
			if (fs.existsSync(tempPath)) {
				fs.unlinkSync(tempPath);
			}

			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
