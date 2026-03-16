import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { Badge } from "react-bootstrap";
import type { ErrorLog } from "src/api/backend";
import { TableLayout } from "src/components/Table/TableLayout";

interface Props {
	data: ErrorLog[];
	isFetching?: boolean;
	onSelectItem?: (id: number) => void;
}

const getStatusBadge = (code: number) => {
	if (code >= 500) return "danger";
	if (code >= 400) return "warning";
	return "secondary";
};

export default function Table({ data, isFetching, onSelectItem }: Props) {
	const columnHelper = createColumnHelper<ErrorLog>();
	const columns = useMemo(
		() => [
			columnHelper.accessor("errorCode", {
				header: "Code",
				cell: (info) => (
					<Badge bg={getStatusBadge(info.getValue())}>{info.getValue()}</Badge>
				),
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor("errorType", {
				header: "Type",
				cell: (info) => (
					<span className="text-secondary">{info.getValue() || "Error"}</span>
				),
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor("errorMessage", {
				header: "Message",
				cell: (info) => (
					<span className="text-truncate" style={{ maxWidth: "300px", display: "inline-block" }}>
						{info.getValue()}
					</span>
				),
			}),
			columnHelper.accessor((row) => `${row.requestMethod} ${row.requestPath}`, {
				id: "request",
				header: "Request",
				cell: (info) => (
					<code className="text-secondary" style={{ fontSize: "12px" }}>
						{info.getValue()}
					</code>
				),
			}),
			columnHelper.accessor("createdOn", {
				header: "Time",
				cell: (info) => (
					<span className="text-secondary" style={{ fontSize: "12px" }}>
						{new Date(info.getValue()).toLocaleString()}
					</span>
				),
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.display({
				id: "actions",
				cell: (info) => {
					return (
						<button
							type="button"
							className="btn btn-action btn-sm px-1"
							onClick={(e) => {
								e.preventDefault();
								onSelectItem?.(info.row.original.id);
							}}
						>
							Details
						</button>
					);
				},
				meta: {
					className: "text-end w-1",
				},
			}),
		],
		[columnHelper, onSelectItem],
	);

	const tableInstance = useReactTable<ErrorLog>({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		rowCount: data.length,
		meta: {
			isFetching,
		},
		enableSortingRemoval: false,
	});

	return <TableLayout tableInstance={tableInstance} />;
}
