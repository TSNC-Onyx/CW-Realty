// Connection categories, in the order the Connections page groups them. Must match the
// cwr.connections.category check (migration 20260926000200_cwr_connections.sql).

export const CONNECTION_CATEGORIES = [
  "Lending",
  "Insurance",
  "Home warranty",
  "Contractors and repairs",
  "Design and staging",
  "Other",
] as const;

export type ConnectionCategory = (typeof CONNECTION_CATEGORIES)[number];
