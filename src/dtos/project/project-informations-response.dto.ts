export class ProjectInformationsResponseDto {
  readonly projectId: string;

  readonly teamId: string;

  readonly teamName: string;

  readonly name: string;

  readonly createdAt: Date;

  readonly updatedAt: Date;

  readonly applicationType?: string;

  readonly analysisFrequency?: string;

  readonly emailAlertEnabled?: boolean;

  readonly monthlyReportEnabled?: boolean;

  readonly weeklyReportEnabled?: boolean;

  readonly sastEnabled?: boolean;

  readonly dastEnabled?: boolean;

  readonly scaEnabled?: boolean;

  readonly containerEnabled?: boolean;

  readonly apiEnabled?: boolean;

  readonly iacEnabled?: boolean;

  readonly sastFastScanEnabled?: boolean;

  readonly aiDataflowEnabled?: boolean;

  readonly sastSeverities?: string[];

  readonly scaSeverities?: string[];

  readonly iacSeverities?: string[];

  readonly incidentCreationOption?: string;

  readonly aiMergeRequestEnabled?: boolean;

  readonly improvingResultsEnabled?: boolean;

  readonly sortsVulnerabilitiesEnabled?: boolean;

  constructor(
    projectId: string,
    teamId: string,
    teamName: string,
    name: string,
    createdAt: Date,
    updatedAt: Date,
    additionalFields: {
      applicationType?: string;
      analysisFrequency?: string;
      emailAlertEnabled?: boolean;
      monthlyReportEnabled?: boolean;
      weeklyReportEnabled?: boolean;
      sastEnabled?: boolean;
      dastEnabled?: boolean;
      scaEnabled?: boolean;
      containerEnabled?: boolean;
      apiEnabled?: boolean;
      iacEnabled?: boolean;
      sastFastScanEnabled?: boolean;
      aiDataflowEnabled?: boolean;
      sastSeverities?: string[];
      scaSeverities?: string[];
      iacSeverities?: string[];
      incidentCreationOption?: string;
      aiMergeRequestEnabled?: boolean;
      improvingResultsEnabled?: boolean;
      sortsVulnerabilitiesEnabled?: boolean;
    } = {},
  ) {
    this.projectId = projectId;
    this.teamId = teamId;
    this.teamName = teamName;
    this.name = name;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.assign(this, additionalFields);
  }

  public toString(): string {
    return JSON.stringify(this);
  }
}
