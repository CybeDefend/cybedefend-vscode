export class GetProjectScaVulnerabilitiesRequestDto {
  projectId: string;

  query: string;

  page: number;

  limit: number;

  sort: string;

  order: string;

  severity: string[];

  status: string[];

  language: string;

  priority: string[];

  pageNumber: number;

  pageSizeNumber: number;

  searchQuery: string;

  constructor(
    projectId: string,
    query: string,
    page: number,
    limit: number,
    sort: string,
    order: string,
    severity: string[],
    status: string[],
    language: string,
    priority: string[],
    pageNumber: number,
    pageSizeNumber: number,
    searchQuery: string,
  ) {
    this.projectId = projectId;
    this.query = query;
    this.page = page;
    this.limit = limit;
    this.sort = sort;
    this.order = order;
    this.severity = severity;
    this.status = status;
    this.language = language;
    this.priority = priority;
    this.pageNumber = pageNumber;
    this.pageSizeNumber = pageSizeNumber;
    this.searchQuery = searchQuery;
  }
}
