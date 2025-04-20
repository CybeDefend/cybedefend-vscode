export class MainStatisticsResponseDto {
  highRiskProjects: number;

  highRiskProjectsInLast7Days: number;
  solvedIssues: number;

  solvedIssuesInLast7Days: number;

  newIssues: number;


  newIssuesInLast7Days: number;

  criticalIssues: number;

  highIssues: number;

  mediumIssues: number;

  lowIssues: number;

  constructor(
    highRiskProjects: number,
    highRiskProjectsInLast7Days: number,
    solvedIssues: number,
    solvedIssuesInLast7Days: number,
    newIssues: number,
    newIssuesInLast7Days: number,
    criticalIssues: number,
    highIssues: number,
    mediumIssues: number,
    lowIssues: number
  ) {
    this.highRiskProjects = highRiskProjects;
    this.highRiskProjectsInLast7Days = highRiskProjectsInLast7Days;
    this.solvedIssues = solvedIssues;
    this.solvedIssuesInLast7Days = solvedIssuesInLast7Days;
    this.newIssues = newIssues;
    this.newIssuesInLast7Days = newIssuesInLast7Days;
    this.criticalIssues = criticalIssues;
    this.highIssues = highIssues;
    this.mediumIssues = mediumIssues;
    this.lowIssues = lowIssues;
  }

  toString() {
    return JSON.stringify(this);
  }
}

export class IssueCountResponseDto {
  readonly critical: number;

  readonly high: number;

  readonly medium: number;

  readonly low: number;

  constructor(critical: number, high: number, medium: number, low: number) {
    this.critical = critical;
    this.high = high;
    this.medium = medium;
    this.low = low;
  }

  public toString(): string {
    return JSON.stringify({
      critical: this.critical,
      high: this.high,
      medium: this.medium,
      low: this.low,
    });
  }
}

export class AnalysisTypeResponseDto {
  readonly type: string;

  readonly lastScan: Date;

  readonly source: string;

  readonly issuesCount: IssueCountResponseDto;

  constructor(
    type: string,
    lastScan: Date,
    source: string,
    issuesCount: IssueCountResponseDto
  ) {
    this.type = type;
    this.lastScan = lastScan;
    this.source = source;
    this.issuesCount = issuesCount;
  }

  public toString(): string {
    return JSON.stringify({
      type: this.type,
      lastScan: this.lastScan,
      source: this.source,
      issuesCount: this.issuesCount,
    });
  }
}

export class ProjectAllInformationsResponseDto {
  readonly projectId: string;

  readonly teamId: string;

  readonly teamName: string;

  readonly name: string;

  readonly createdAt: Date;

  readonly updatedAt: Date;

  readonly riskLevel: string;

  readonly issuesCount: IssueCountResponseDto;

  readonly analyses: AnalysisTypeResponseDto[];

  constructor(
    projectId: string,
    teamId: string,
    teamName: string,
    name: string,
    createdAt: Date,
    updatedAt: Date,
    riskLevel: string,
    issuesCount: IssueCountResponseDto,
    analyses: AnalysisTypeResponseDto[]
  ) {
    this.projectId = projectId;
    this.teamId = teamId;
    this.teamName = teamName;
    this.name = name;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.riskLevel = riskLevel;
    this.issuesCount = issuesCount;
    this.analyses = analyses;
  }

  public toString(): string {
    return JSON.stringify({
      id: this.projectId,
      teamId: this.teamId,
      teamName: this.teamName,
      name: this.name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      riskLevel: this.riskLevel,
      issuesCount: this.issuesCount,
      analyses: this.analyses,
    });
  }
}

export class PaginatedProjectsAllInformationsResponseDto {
  readonly projects: ProjectAllInformationsResponseDto[];

  readonly totalProjects: number;

  readonly totalPages: number;

  readonly mainStatistics: MainStatisticsResponseDto;

  constructor(
    projects: ProjectAllInformationsResponseDto[],
    totalProjects: number,
    totalPages: number,
    mainStatistics: MainStatisticsResponseDto
  ) {
    this.projects = projects;
    this.totalProjects = totalProjects;
    this.totalPages = totalPages;
    this.mainStatistics = mainStatistics;
  }

  public toString(): string {
    return JSON.stringify({
      projects: this.projects,
      totalProjects: this.totalProjects,
      totalPages: this.totalPages,
      mainStatistics: this.mainStatistics,
    });
  }
}
