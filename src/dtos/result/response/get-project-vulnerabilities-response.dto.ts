import { DetailedVulnerability } from "../details";

export class CountVulnerabilitiesCountByType {
  sast: number;

  iac: number;

  sca: number;

  constructor(sast: number, iac: number, sca: number) {
    this.sast = sast;
    this.iac = iac;
    this.sca = sca;
  }
}

export class ScanProjectInfoDto {
  scanId: string;

  state: string;

  createAt: Date;

  scanType?: string;

  constructor(
    scanId: string,
    state: string,
    createAt: Date,
    scanType?: string
  ) {
    this.scanId = scanId;
    this.state = state;
    this.createAt = createAt;
    this.scanType = scanType;
  }

  public toString(): string {
    return JSON.stringify(this);
  }
}

export class GetProjectVulnerabilitiesResponseDto {
  projectId: string;

  projectName: string;

  page: number;

  limit: number;

  totalPages: number;

  sort: string;


  order: string;


  severity: string[];


  status: string[];


  language: string;


  priority: string[];

  vulnerabilities: DetailedVulnerability[];

  total: number;

  scanProjectInfo: ScanProjectInfoDto;

  vulnCountByType: CountVulnerabilitiesCountByType;

  constructor(
    projectId: string,
    projectName: string,
    page: number,
    limit: number,
    totalPages: number,
    sort: string,
    order: string,
    severity: string[],
    status: string[],
    language: string,
    priority: string[],
    vulnerabilities: any[],
    total: number,
    scanProjectInfo: ScanProjectInfoDto,
    vulnCountByType: CountVulnerabilitiesCountByType
  ) {
    this.projectId = projectId;
    this.projectName = projectName;
    this.page = page;
    this.limit = limit;
    this.totalPages = totalPages;
    this.sort = sort;
    this.order = order;
    this.severity = severity;
    this.status = status;
    this.language = language;
    this.priority = priority;
    this.vulnerabilities = vulnerabilities;
    this.total = total;
    this.scanProjectInfo = scanProjectInfo;
    this.vulnCountByType = vulnCountByType;
  }

  public toString(): string {
    return JSON.stringify(this);
  }
}
