import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
	Alert,
	Badge,
	Button,
	Card,
	Col,
	Container,
	Modal,
	Row,
	Spinner,
	Table,
} from "react-bootstrap";
import {
	downloadBackup,
	getBackupMetadata,
	restoreBackup,
	type BackupMetadata,
} from "src/api/backend";

const tableLabels: Record<string, string> = {
	user: "Users",
	auth: "Auth Credentials",
	user_permission: "User Permissions",
	token: "API Tokens",
	proxy_host: "Proxy Hosts",
	redirection_host: "Redirection Hosts",
	dead_host: "404 Hosts",
	stream: "Streams",
	certificate: "Certificates",
	access_list: "Access Lists",
	access_list_client: "Access List Clients",
	access_list_auth: "Access List Auth",
	setting: "Settings",
};

function Backup() {
	const [isDownloading, setIsDownloading] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);
	const [restoreFile, setRestoreFile] = useState<File | null>(null);
	const [alertMsg, setAlertMsg] = useState<{
		type: string;
		text: string;
	} | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { data: metadata, isLoading } = useQuery<BackupMetadata>({
		queryKey: ["backup-metadata"],
		queryFn: () => getBackupMetadata(),
	});

	const handleDownload = async () => {
		setIsDownloading(true);
		setAlertMsg(null);
		try {
			await downloadBackup();
			setAlertMsg({ type: "success", text: "Backup downloaded successfully." });
		} catch (err: any) {
			setAlertMsg({
				type: "danger",
				text: `Download failed: ${err.message || "Unknown error"}`,
			});
		}
		setIsDownloading(false);
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			if (!file.name.endsWith(".zip")) {
				setAlertMsg({
					type: "danger",
					text: "Please select a valid .zip backup file.",
				});
				return;
			}
			setRestoreFile(file);
			setShowConfirm(true);
		}
	};

	const handleRestore = async () => {
		if (!restoreFile) return;
		setShowConfirm(false);
		setIsRestoring(true);
		setAlertMsg(null);
		try {
			const result = await restoreBackup(restoreFile);
			setAlertMsg({
				type: "success",
				text: `${result.message} (from backup v${result.metadata.version}, created ${new Date(result.metadata.createdAt).toLocaleString()})`,
			});
		} catch (err: any) {
			setAlertMsg({
				type: "danger",
				text: `Restore failed: ${err.message || "Unknown error"}`,
			});
		}
		setIsRestoring(false);
		setRestoreFile(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const handleCancelRestore = () => {
		setShowConfirm(false);
		setRestoreFile(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	if (isLoading) {
		return (
			<Container className="py-5 text-center">
				<Spinner animation="border" role="status">
					<span className="visually-hidden">Loading...</span>
				</Spinner>
			</Container>
		);
	}

	const totalRecords = metadata
		? Object.values(metadata.counts).reduce((a, b) => a + b, 0)
		: 0;

	return (
		<Container fluid className="py-4">
			<Row className="mb-4">
				<Col>
					<h1>Backup &amp; Restore</h1>
					<p className="text-muted">
						Download a complete backup or restore from a previous backup file.
					</p>
				</Col>
			</Row>

			{alertMsg && (
				<Row className="mb-4">
					<Col>
						<Alert
							variant={alertMsg.type}
							dismissible
							onClose={() => setAlertMsg(null)}
						>
							{alertMsg.text}
						</Alert>
					</Col>
				</Row>
			)}

			<Row className="mb-4">
				<Col md={6} className="mb-3">
					<Card className="h-100">
						<Card.Header>
							<h3 className="card-title">Download Backup</h3>
						</Card.Header>
						<Card.Body>
							<p>
								Creates a ZIP archive containing your entire configuration:
								database, SSL certificates, Nginx configs, and JWT keys.
							</p>
							<Button
								variant="primary"
								size="lg"
								onClick={handleDownload}
								disabled={isDownloading}
							>
								{isDownloading ? (
									<>
										<Spinner
											animation="border"
											size="sm"
											className="me-2"
										/>
										Creating Backup...
									</>
								) : (
									<>Download Backup</>
								)}
							</Button>
						</Card.Body>
					</Card>
				</Col>
				<Col md={6} className="mb-3">
					<Card className="h-100">
						<Card.Header>
							<h3 className="card-title">Restore Backup</h3>
						</Card.Header>
						<Card.Body>
							<p>
								Upload a previously downloaded backup file to restore all
								configuration. This will <strong>overwrite</strong> all
								current data.
							</p>
							<input
								ref={fileInputRef}
								type="file"
								accept=".zip"
								onChange={handleFileSelect}
								className="form-control"
								disabled={isRestoring}
							/>
							{isRestoring && (
								<div className="mt-3">
									<Spinner
										animation="border"
										size="sm"
										className="me-2"
									/>
									Restoring...
								</div>
							)}
						</Card.Body>
					</Card>
				</Col>
			</Row>

			{metadata && (
				<Row>
					<Col>
						<Card>
							<Card.Header>
								<h3 className="card-title">
									System Info{" "}
									<Badge bg="secondary" className="ms-2">
										{totalRecords} total records
									</Badge>
								</h3>
							</Card.Header>
							<Card.Body>
								<Row className="mb-3">
									<Col md={4}>
										<strong>Version:</strong> {metadata.version}
									</Col>
									<Col md={4}>
										<strong>Database Engine:</strong>{" "}
										{metadata.database.engine}
									</Col>
									<Col md={4}>
										<strong>Date:</strong>{" "}
										{new Date(metadata.date).toLocaleString()}
									</Col>
								</Row>
								<Table striped bordered hover size="sm">
									<thead>
										<tr>
											<th>Table</th>
											<th className="text-end">Records</th>
										</tr>
									</thead>
									<tbody>
										{Object.entries(metadata.counts).map(
											([table, count]) => (
												<tr key={table}>
													<td>
														{tableLabels[table] || table}
													</td>
													<td className="text-end">{count}</td>
												</tr>
											),
										)}
									</tbody>
								</Table>
							</Card.Body>
						</Card>
					</Col>
				</Row>
			)}

			<Modal show={showConfirm} onHide={handleCancelRestore} centered>
				<Modal.Header closeButton>
					<Modal.Title>Confirm Restore</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<Alert variant="warning">
						<strong>Warning:</strong> This will overwrite all current
						configuration data, including hosts, certificates, users, and
						settings.
					</Alert>
					<p>
						Are you sure you want to restore from{" "}
						<strong>{restoreFile?.name}</strong>?
					</p>
				</Modal.Body>
				<Modal.Footer>
					<Button variant="secondary" onClick={handleCancelRestore}>
						Cancel
					</Button>
					<Button variant="danger" onClick={handleRestore}>
						Restore Backup
					</Button>
				</Modal.Footer>
			</Modal>
		</Container>
	);
}

export default Backup;
