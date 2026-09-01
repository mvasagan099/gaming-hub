export interface PaginationQuery {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function clampPagination(pageRaw: unknown, pageSizeRaw: unknown): PaginationQuery {
  const page = Math.max(1, Number(pageRaw) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(pageSizeRaw) || 20));
  return { page, pageSize };
}
