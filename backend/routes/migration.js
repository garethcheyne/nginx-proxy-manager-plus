import express from "express";
import fs from "node:fs";
import path from "node:path";
import jwtdecode from "../lib/express/jwt-decode.js";
import internalMigration from "../internal/migration.js";
import error from "../lib/error.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * Validate migration export file
 *
 * POST /api/migration/validate
 */
router.post("/validate", jwtdecode(), async (req, res, next) => {
	try {
		if (!req.files || !req.files.file) {
			throw new error.ValidationError("No file uploaded");
		}

		const uploadedFile = req.files.file;
		const tempPath = `/tmp/npm-migration-${Date.now()}.zip`;

		// Move uploaded file to temp location
		await uploadedFile.mv(tempPath);

		try {
			const result = await internalMigration.validateExport(res.locals.access, tempPath);
			res.status(200).send(result);
		} finally {
			// Cleanup temp file
			if (fs.existsSync(tempPath)) {
				fs.unlinkSync(tempPath);
			}
		}
	} catch (err) {
		next(err);
	}
});

/**
 * Import from migration export file
 *
 * POST /api/migration/import
 */
router.post("/import", jwtdecode(), async (req, res, next) => {
	try {
		if (!req.files || !req.files.file) {
			throw new error.ValidationError("No file uploaded");
		}

		const uploadedFile = req.files.file;
		const tempPath = `/tmp/npm-migration-import-${Date.now()}.zip`;

		// Move uploaded file to temp location
		await uploadedFile.mv(tempPath);

		// Parse import options from body
		const options = {
			importUsers: req.body.importUsers !== "false",
			importHosts: req.body.importHosts !== "false",
			importCertificates: req.body.importCertificates !== "false",
			importAccessLists: req.body.importAccessLists !== "false",
			overwriteExisting: req.body.overwriteExisting === "true",
		};

		try {
			const result = await internalMigration.importExport(res.locals.access, tempPath, options);
			res.status(200).send(result);
		} finally {
			// Cleanup temp file
			if (fs.existsSync(tempPath)) {
				fs.unlinkSync(tempPath);
			}
		}
	} catch (err) {
		next(err);
	}
});

export default router;
