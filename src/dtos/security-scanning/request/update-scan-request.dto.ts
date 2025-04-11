export class UpdateScanRequestDto {
  state: string;

  startedAt?: string;

  clusterId?: string;

  podId?: string;

  podName?: string;

  image?: string;

  version?: string;

  scanId?: string;

  totalVulnerabilities?: number;

  processedVulnerabilities?: number;

  step?: string;

  constructor(
    scanId: string,
    state: string,
    startedAt: string,
    clusterId: string,
    podId: string,
    podName: string,
    image: string,
    version: string,
    totalVulnerabilities: number,
    processedVulnerabilities: number,
    step: string
  ) {
    this.state = state;
    this.startedAt = startedAt;
    this.clusterId = clusterId;
    this.podId = podId;
    this.podName = podName;
    this.image = image;
    this.version = version;
    this.scanId = scanId;
    this.totalVulnerabilities = totalVulnerabilities;
    this.processedVulnerabilities = processedVulnerabilities;
    this.step = step;
  }

  toString(): string {
    return JSON.stringify(this);
  }
}
