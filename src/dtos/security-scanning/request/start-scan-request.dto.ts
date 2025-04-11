// src/global-management/scan/body/start-scan-request.dto.ts

export enum VulnerabilityType {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export class StartScanRequestDto {
  scanId: string;

  url: string;

  projectId: string;

  filename: string;

  privateScan: boolean;

  vulnerabilityTypes: VulnerabilityType[];

  constructor(
    scanId: string,
    url: string,
    projectId: string,
    filename: string,
    privateScan: boolean,
    vulnerabilityTypes: VulnerabilityType[],
  ) {
    this.scanId = scanId;
    this.url = url;
    this.projectId = projectId;
    this.filename = filename;
    this.privateScan = privateScan;
    this.vulnerabilityTypes = vulnerabilityTypes;
  }
}
