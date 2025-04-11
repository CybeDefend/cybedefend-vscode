export class GetLastScanStatusResponseDto {
  id: string;

  state: string;

  projectId: string;

  createAt: Date;

  scanType?: string;

  constructor(id: string, state: string, projectId: string, createAt: Date, scanType: string) {
    this.id = id;
    this.state = state;
    this.projectId = projectId;
    this.createAt = createAt;
    this.scanType = scanType;
  }

  public toString(): string {
    return JSON.stringify(this);
  }
}