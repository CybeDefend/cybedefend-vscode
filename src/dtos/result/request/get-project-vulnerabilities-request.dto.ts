export class GetProjectVulnerabilitiesRequestDto {
  projectId: string;

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
