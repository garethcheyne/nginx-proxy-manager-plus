import CodeEditor from "@uiw/react-textarea-code-editor";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Alert, Badge } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button, Loading } from "src/components";
import { useErrorLog } from "src/hooks";

const showErrorDetailsModal = (id: number) => {
	EasyModal.show(ErrorDetailsModal, { id });
};

const getStatusBadge = (code: number) => {
	if (code >= 500) return "danger";
	if (code >= 400) return "warning";
	return "secondary";
};

interface Props extends InnerModalProps {
	id: number;
}
const ErrorDetailsModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useErrorLog(id);

	return (
		<Modal show={visible} onHide={remove} size="lg">
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			{isLoading && <Loading noLogo />}
			{!isLoading && data && (
				<>
					<Modal.Header closeButton>
						<Modal.Title>
							Error Details #{data.id}
						</Modal.Title>
					</Modal.Header>
					<Modal.Body>
						<div className="datagrid mb-3">
							<div className="datagrid-item">
								<div className="datagrid-title">Status Code</div>
								<div className="datagrid-content">
									<Badge bg={getStatusBadge(data.errorCode)}>{data.errorCode}</Badge>
								</div>
							</div>
							<div className="datagrid-item">
								<div className="datagrid-title">Error Type</div>
								<div className="datagrid-content">{data.errorType || "Unknown"}</div>
							</div>
							<div className="datagrid-item">
								<div className="datagrid-title">Request</div>
								<div className="datagrid-content">
									<code>{data.requestMethod} {data.requestPath}</code>
								</div>
							</div>
							<div className="datagrid-item">
								<div className="datagrid-title">Client IP</div>
								<div className="datagrid-content">{data.requestIp || "N/A"}</div>
							</div>
							<div className="datagrid-item">
								<div className="datagrid-title">Time</div>
								<div className="datagrid-content">
									{new Date(data.createdOn).toLocaleString()}
								</div>
							</div>
							{data.user && (
								<div className="datagrid-item">
									<div className="datagrid-title">User</div>
									<div className="datagrid-content">{data.user.name} ({data.user.email})</div>
								</div>
							)}
						</div>

						<h4 className="mb-2">Error Message</h4>
						<Alert variant="danger" className="mb-3">
							{data.errorMessage}
						</Alert>

						{data.stackTrace && (
							<>
								<h4 className="mb-2">Stack Trace</h4>
								<CodeEditor
									language="text"
									padding={15}
									data-color-mode="dark"
									minHeight={200}
									style={{
										fontFamily:
											"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
										borderRadius: "0.3rem",
										minHeight: "200px",
										backgroundColor: "var(--tblr-bg-surface-dark)",
										fontSize: "12px",
									}}
									readOnly
									value={data.stackTrace}
								/>
							</>
						)}

						{data.meta && Object.keys(data.meta).length > 0 && (
							<>
								<h4 className="mt-3 mb-2">Additional Details</h4>
								<CodeEditor
									language="json"
									padding={15}
									data-color-mode="dark"
									minHeight={100}
									indentWidth={2}
									style={{
										fontFamily:
											"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
										borderRadius: "0.3rem",
										minHeight: "100px",
										backgroundColor: "var(--tblr-bg-surface-dark)",
									}}
									readOnly
									value={JSON.stringify(data.meta, null, 2)}
								/>
							</>
						)}
					</Modal.Body>
					<Modal.Footer>
						<Button data-bs-dismiss="modal" onClick={remove}>
							Close
						</Button>
					</Modal.Footer>
				</>
			)}
		</Modal>
	);
});

export { showErrorDetailsModal };
