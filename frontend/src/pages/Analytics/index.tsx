import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useState } from "react";
import { Card, Col, Container, Row, Spinner, Table } from "react-bootstrap";
import { getAnalyticsStats, type AnalyticsStats } from "src/api/backend";

function Analytics() {
	const [dateRange] = useState({
		dateFrom: format(subDays(new Date(), 7), "yyyy-MM-dd"),
		dateTo: format(new Date(), "yyyy-MM-dd"),
	});

	const { data: stats, isLoading } = useQuery<AnalyticsStats>({
		queryKey: ["analytics-stats", dateRange],
		queryFn: () =>
			getAnalyticsStats({
				dateFrom: dateRange.dateFrom,
				dateTo: dateRange.dateTo,
			}),
		refetchInterval: 60000, // Refresh every minute
	});

	if (isLoading) {
		return (
			<Container className="py-5 text-center">
				<Spinner animation="border" role="status">
					<span className="visually-hidden">Loading...</span>
				</Spinner>
			</Container>
		);
	}

	return (
		<Container fluid className="py-4">
			<Row className="mb-4">
				<Col>
					<h1>Analytics Dashboard</h1>
					<p className="text-muted">Visitor statistics and traffic insights</p>
				</Col>
			</Row>

			<Row className="mb-4">
				<Col md={6} lg={3} className="mb-3">
					<Card>
						<Card.Body>
							<Card.Title className="text-muted small">Total Visits</Card.Title>
							<h2 className="mb-0">{stats?.totalVisits.toLocaleString() || 0}</h2>
						</Card.Body>
					</Card>
				</Col>
				<Col md={6} lg={3} className="mb-3">
					<Card>
						<Card.Body>
							<Card.Title className="text-muted small">Unique Visitors</Card.Title>
							<h2 className="mb-0">{stats?.uniqueVisitors.toLocaleString() || 0}</h2>
						</Card.Body>
					</Card>
				</Col>
				<Col md={6} lg={3} className="mb-3">
					<Card>
						<Card.Body>
							<Card.Title className="text-muted small">Success Rate</Card.Title>
							<h2 className="mb-0">
								{stats?.statusCodes
									? (
											(stats.statusCodes
												.filter((s) => s.statusCode >= 200 && s.statusCode < 400)
												.reduce((acc, s) => acc + s.count, 0) /
												stats.totalVisits) *
											100
										).toFixed(1)
									: 0}
								%
							</h2>
						</Card.Body>
					</Card>
				</Col>
				<Col md={6} lg={3} className="mb-3">
					<Card>
						<Card.Body>
							<Card.Title className="text-muted small">Countries</Card.Title>
							<h2 className="mb-0">{stats?.topCountries.length || 0}</h2>
						</Card.Body>
					</Card>
				</Col>
			</Row>

			<Row className="mb-4">
				<Col lg={6} className="mb-3">
					<Card>
						<Card.Header>
							<Card.Title className="mb-0">Top Pages</Card.Title>
						</Card.Header>
						<Card.Body className="p-0">
							<Table striped hover className="mb-0">
								<thead>
									<tr>
										<th>Page</th>
										<th>Domain</th>
										<th className="text-end">Visits</th>
									</tr>
								</thead>
								<tbody>
									{stats?.topPages.slice(0, 10).map((page, idx) => (
										<tr key={idx}>
											<td className="text-truncate" style={{ maxWidth: "200px" }}>
												{page.requestUri}
											</td>
											<td className="text-truncate" style={{ maxWidth: "150px" }}>
												{page.domainName}
											</td>
											<td className="text-end">{page.visits}</td>
										</tr>
									))}
									{(!stats?.topPages || stats.topPages.length === 0) && (
										<tr>
											<td colSpan={3} className="text-center text-muted">
												No data available
											</td>
										</tr>
									)}
								</tbody>
							</Table>
						</Card.Body>
					</Card>
				</Col>

				<Col lg={6} className="mb-3">
					<Card>
						<Card.Header>
							<Card.Title className="mb-0">Top Referrers</Card.Title>
						</Card.Header>
						<Card.Body className="p-0">
							<Table striped hover className="mb-0">
								<thead>
									<tr>
										<th>Referrer</th>
										<th className="text-end">Visits</th>
									</tr>
								</thead>
								<tbody>
									{stats?.topReferers.slice(0, 10).map((referer, idx) => (
										<tr key={idx}>
											<td className="text-truncate" style={{ maxWidth: "300px" }}>
												{referer.referer}
											</td>
											<td className="text-end">{referer.visits}</td>
										</tr>
									))}
									{(!stats?.topReferers || stats.topReferers.length === 0) && (
										<tr>
											<td colSpan={2} className="text-center text-muted">
												No data available
											</td>
										</tr>
									)}
								</tbody>
							</Table>
						</Card.Body>
					</Card>
				</Col>
			</Row>

			<Row className="mb-4">
				<Col lg={6} className="mb-3">
					<Card>
						<Card.Header>
							<Card.Title className="mb-0">Status Codes</Card.Title>
						</Card.Header>
						<Card.Body className="p-0">
							<Table striped hover className="mb-0">
								<thead>
									<tr>
										<th>Status Code</th>
										<th className="text-end">Count</th>
										<th className="text-end">%</th>
									</tr>
								</thead>
								<tbody>
									{stats?.statusCodes.map((status, idx) => (
										<tr key={idx}>
											<td>
												<span
													className={`badge ${
														status.statusCode >= 200 && status.statusCode < 300
															? "bg-success"
															: status.statusCode >= 300 && status.statusCode < 400
																? "bg-info"
																: status.statusCode >= 400 && status.statusCode < 500
																	? "bg-warning"
																	: "bg-danger"
													}`}
												>
													{status.statusCode}
												</span>
											</td>
											<td className="text-end">{status.count}</td>
											<td className="text-end">
												{stats.totalVisits > 0 ? ((status.count / stats.totalVisits) * 100).toFixed(1) : 0}
												%
											</td>
										</tr>
									))}
									{(!stats?.statusCodes || stats.statusCodes.length === 0) && (
										<tr>
											<td colSpan={3} className="text-center text-muted">
												No data available
											</td>
										</tr>
									)}
								</tbody>
							</Table>
						</Card.Body>
					</Card>
				</Col>

				<Col lg={6} className="mb-3">
					<Card>
						<Card.Header>
							<Card.Title className="mb-0">Top Countries</Card.Title>
						</Card.Header>
						<Card.Body className="p-0">
							<Table striped hover className="mb-0">
								<thead>
									<tr>
										<th>Country</th>
										<th className="text-end">Visits</th>
									</tr>
								</thead>
								<tbody>
									{stats?.topCountries.slice(0, 10).map((country, idx) => (
										<tr key={idx}>
											<td>
												{country.countryCode || "Unknown"}{" "}
												{country.countryCode && <span className="text-muted">({country.countryCode})</span>}
											</td>
											<td className="text-end">{country.visits}</td>
										</tr>
									))}
									{(!stats?.topCountries || stats.topCountries.length === 0) && (
										<tr>
											<td colSpan={2} className="text-center text-muted">
												No data available
											</td>
										</tr>
									)}
								</tbody>
							</Table>
						</Card.Body>
					</Card>
				</Col>
			</Row>

			<Row>
				<Col lg={12} className="mb-3">
					<Card>
						<Card.Header>
							<Card.Title className="mb-0">Top User Agents</Card.Title>
						</Card.Header>
						<Card.Body className="p-0">
							<Table striped hover className="mb-0">
								<thead>
									<tr>
										<th>User Agent</th>
										<th className="text-end">Visits</th>
									</tr>
								</thead>
								<tbody>
									{stats?.topUserAgents.slice(0, 10).map((ua, idx) => (
										<tr key={idx}>
											<td className="text-truncate" style={{ maxWidth: "600px" }}>
												{ua.userAgent}
											</td>
											<td className="text-end">{ua.visits}</td>
										</tr>
									))}
									{(!stats?.topUserAgents || stats.topUserAgents.length === 0) && (
										<tr>
											<td colSpan={2} className="text-center text-muted">
												No data available
											</td>
										</tr>
									)}
								</tbody>
							</Table>
						</Card.Body>
					</Card>
				</Col>
			</Row>
		</Container>
	);
}

export default Analytics;
