import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import extractZip from "extract-zip";
import { debug, global as logger } from "../logger.js";
import db from "../db.js";
import error from "../lib/error.js";
import pjson from "../package.json" with { type: "json" };

const backupTables = [
	"user",
	"auth",
	"user_permission",
	"token",
	"proxy_host",
	"redirection_host",
	"dead_host",
	"stream",
	"certificate",
	"access_list",
	"access_list_client",
	"access_list_auth",
	"setting",
	"error_log",
];

const dataDirs = [
	{ src: "/data/nginx", dest: "nginx" },
	{ src: "/data/custom_ssl", dest: "certificates/custom_ssl" },
	{ src: "/data/keys.json", dest: "keys.json" },
];

const letsencryptDirs = [
	{ src: "/etc/letsencrypt/live", dest: "certificates/letsencrypt/live" },
	{ src: "/etc/letsencrypt/archive", dest: "certificates/letsencrypt/archive" },
	{ src: "/etc/letsencrypt/renewal", dest: "certificates/letsencrypt/renewal" },
	{ src: "/etc/letsencrypt/credentials", dest: "credentials" },
];

/**
 * Recursively add a directory to an archive
 */
const addDirectoryToArchive = (archive, dirPath, archivePath) => {
	if (fs.existsSync(dirPath)) {
		archive.directory(dirPath, archivePath);
		return true;
	}
	return false;
};

const internalBackup = {
	/**
	 * Get system metadata for backup info
	 * @param {Access} access
	 * @returns {Promise}
	 */
	getMetadata: async (access) => {
		await access.can("backup:list");

		const knex = db();
		const counts = {};

		for (const table of backupTables) {
			try {
				const result = await knex(table).count("id as count").where("is_deleted", 0).first();
				counts[table] = result ? result.count : 0;
			} catch {
				// Table might not have is_deleted column (e.g. setting)
				try {
					const result = await knex(table).count("id as count").first();
					counts[table] = result ? result.count : 0;
				} catch {
					counts[table] = 0;
				}
			}
		}

		const dbConfig = knex.client.config;

		return {
			version: pjson.version,
			date: new Date().toISOString(),
			database: {
				engine: dbConfig.client,
			},
			counts,
		};
	},

	/**
	 * Create a full backup ZIP
	 * @param {Access} access
	 * @returns {Promise<{fileName: string}>}
	 */
	createBackup: async (access) => {
		await access.can("backup:download");

		debug(logger, "Starting backup creation...");
		const knex = db();

		// Export all database tables as JSON
		const databaseExport = {};
		for (const table of backupTables) {
			try {
				databaseExport[table] = await knex(table).select("*");
				debug(logger, `Exported ${databaseExport[table].length} rows from ${table}`);
			} catch (err) {
				logger.warn(`Failed to export table ${table}: ${err.message}`);
				databaseExport[table] = [];
			}
		}

		// Build metadata
		const metadata = {
			version: pjson.version,
			createdAt: new Date().toISOString(),
			database: {
				engine: knex.client.config.client,
				tables: Object.keys(databaseExport).reduce((acc, table) => {
					acc[table] = databaseExport[table].length;
					return acc;
				}, {}),
			},
		};

		// Create ZIP
		const downloadName = `npm-backup-${Date.now()}.zip`;
		const outPath = `/tmp/${downloadName}`;
		const archive = archiver("zip", { zlib: { level: 9 } });
		const stream = fs.createWriteStream(outPath);

		await new Promise((resolve, reject) => {
			archive.on("error", (err) => reject(err));
			stream.on("close", () => resolve());
			archive.pipe(stream);

			// Add metadata
			archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });

			// Add database export
			archive.append(JSON.stringify(databaseExport, null, 2), { name: "database.json" });

			// Add data directories and files
			for (const dir of dataDirs) {
				if (fs.existsSync(dir.src)) {
					const stat = fs.statSync(dir.src);
					if (stat.isDirectory()) {
						addDirectoryToArchive(archive, dir.src, dir.dest);
						debug(logger, `Added directory ${dir.src} to backup`);
					} else {
						archive.file(dir.src, { name: dir.dest });
						debug(logger, `Added file ${dir.src} to backup`);
					}
				}
			}

			// Add Let's Encrypt directories
			for (const dir of letsencryptDirs) {
				if (fs.existsSync(dir.src)) {
					addDirectoryToArchive(archive, dir.src, dir.dest);
					debug(logger, `Added letsencrypt dir ${dir.src} to backup`);
				}
			}

			archive.finalize();
		});

		debug(logger, `Backup created: ${outPath}`);
		return { fileName: outPath };
	},

	/**
	 * Restore from a backup ZIP
	 * @param {Access}  access
	 * @param {String}  zipPath  Path to the uploaded ZIP file
	 * @returns {Promise<{message: string, metadata: object}>}
	 */
	restoreBackup: async (access, zipPath) => {
		await access.can("backup:restore");

		if (!fs.existsSync(zipPath)) {
			throw new error.ItemNotFoundError("Backup file not found");
		}

		debug(logger, `Starting restore from ${zipPath}...`);

		// Extract to temp directory
		const extractDir = `/tmp/npm-restore-${Date.now()}`;
		fs.mkdirSync(extractDir, { recursive: true });

		try {
			await extractZip(zipPath, { dir: extractDir });
		} catch (err) {
			fs.rmSync(extractDir, { recursive: true, force: true });
			throw new error.ValidationError(`Invalid backup file: ${err.message}`);
		}

		// Validate metadata
		const metadataPath = path.join(extractDir, "metadata.json");
		if (!fs.existsSync(metadataPath)) {
			fs.rmSync(extractDir, { recursive: true, force: true });
			throw new error.ValidationError("Invalid backup: missing metadata.json");
		}

		let metadata;
		try {
			metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
		} catch {
			fs.rmSync(extractDir, { recursive: true, force: true });
			throw new error.ValidationError("Invalid backup: corrupted metadata.json");
		}

		// Validate database.json exists
		const dbPath = path.join(extractDir, "database.json");
		if (!fs.existsSync(dbPath)) {
			fs.rmSync(extractDir, { recursive: true, force: true });
			throw new error.ValidationError("Invalid backup: missing database.json");
		}

		let databaseExport;
		try {
			databaseExport = JSON.parse(fs.readFileSync(dbPath, "utf8"));
		} catch {
			fs.rmSync(extractDir, { recursive: true, force: true });
			throw new error.ValidationError("Invalid backup: corrupted database.json");
		}

		const knex = db();

		// Normalize ISO datetime strings for MySQL compatibility
		const normalizeDates = (rows) => {
			return rows.map((row) => {
				const normalized = { ...row };
				for (const [key, value] of Object.entries(normalized)) {
					if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)) {
						normalized[key] = value.replace("T", " ").replace(".000Z", "");
					}
				}
				return normalized;
			});
		};

		// Restore database within a transaction
		await knex.transaction(async (trx) => {
			// Disable foreign key checks for MySQL
			const isMysql = knex.client.config.client === "mysql2";
			if (isMysql) {
				await trx.raw("SET FOREIGN_KEY_CHECKS = 0");
			}

			// Restore in correct order (respecting foreign keys)
			const restoreOrder = [
				"user",
				"auth",
				"user_permission",
				"token",
				"setting",
				"access_list",
				"access_list_auth",
				"access_list_client",
				"certificate",
				"proxy_host",
				"redirection_host",
				"dead_host",
				"stream",
			];

			for (const table of restoreOrder) {
				if (databaseExport[table] && databaseExport[table].length > 0) {
					try {
						await trx(table).del();
						// Insert in batches of 100 to avoid query size limits
						const rows = normalizeDates(databaseExport[table]);
						for (let i = 0; i < rows.length; i += 100) {
							const batch = rows.slice(i, i + 100);
							await trx(table).insert(batch);
						}
						debug(logger, `Restored ${rows.length} rows to ${table}`);
					} catch (err) {
						logger.warn(`Failed to restore table ${table}: ${err.message}`);
						throw new error.InternalError(`Failed to restore table ${table}: ${err.message}`);
					}
				}
			}

			// Re-enable foreign key checks
			if (isMysql) {
				await trx.raw("SET FOREIGN_KEY_CHECKS = 1");
			}
		});

		// Restore files
		const restoreFiles = [
			{ src: "nginx", dest: "/data/nginx" },
			{ src: "certificates/custom_ssl", dest: "/data/custom_ssl" },
			{ src: "keys.json", dest: "/data/keys.json" },
			{ src: "certificates/letsencrypt/live", dest: "/etc/letsencrypt/live" },
			{ src: "certificates/letsencrypt/archive", dest: "/etc/letsencrypt/archive" },
			{ src: "certificates/letsencrypt/renewal", dest: "/etc/letsencrypt/renewal" },
			{ src: "credentials", dest: "/etc/letsencrypt/credentials" },
		];

		for (const item of restoreFiles) {
			const srcPath = path.join(extractDir, item.src);
			if (fs.existsSync(srcPath)) {
				const stat = fs.statSync(srcPath);
				if (stat.isDirectory()) {
					// Remove existing and copy new
					fs.mkdirSync(item.dest, { recursive: true });
					copyDirectorySync(srcPath, item.dest);
					debug(logger, `Restored directory ${item.dest}`);
				} else {
					fs.mkdirSync(path.dirname(item.dest), { recursive: true });
					fs.copyFileSync(srcPath, item.dest);
					debug(logger, `Restored file ${item.dest}`);
				}
			}
		}

		// Cleanup temp directory
		fs.rmSync(extractDir, { recursive: true, force: true });

		debug(logger, "Restore completed successfully");
		return {
			message: "Backup restored successfully",
			metadata,
		};
	},
};

/**
 * Recursively copy a directory
 */
function copyDirectorySync(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	const entries = fs.readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirectorySync(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

export default internalBackup;
