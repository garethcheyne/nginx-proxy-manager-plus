import Alert from "react-bootstrap/Alert";
import { LoadingPage } from "src/components";
import { useErrorLogs } from "src/hooks";
import { showErrorDetailsModal } from "src/modals";
import Table from "./Table";

export default function TableWrapper() {
	const { isFetching, isLoading, isError, error, data } = useErrorLogs();

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-red" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">Error Log</h2>
						</div>
					</div>
				</div>
				<Table data={data ?? []} isFetching={isFetching} onSelectItem={showErrorDetailsModal} />
			</div>
		</div>
	);
}
