
export class ContainerDto {
  id: string;

  status: string;

  createdAt: Date;

  startedAt: Date;

  finishedAt: Date;

  scanId: string;

  constructor(id: string, status: string, createdAt: Date, startedAt: Date, finishedAt: Date, scanId: string) {
    this.id = id;
    this.status = status;
    this.createdAt = createdAt;
    this.startedAt = startedAt;
    this.finishedAt = finishedAt;
    this.scanId = scanId;
  }

  public toString(): string {
    return JSON.stringify({
      id: this.id,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      scanId: this.scanId,
    });
  }
}


/** Valid states for a scan */
export enum ScanState {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export class ScanResponseDto {
  id: string;

  name: string;

  state: string;

  language: string[];


  projectId: string;

  private: boolean;

  initializerUserId?: string;

  createAt: Date;

  updatedAt: Date;

  scanType?: string;

  startTime?: Date;

  endTime?: Date;

  containers: ContainerDto[];

  progress: number;

  step: string;

  vulnerabilityDetected?: number;

  constructor(
    id: string,
    name: string,
    state: string,
    language: string[],
    projectId: string,
    privateScan: boolean,
    initializerUserId: string,
    createAt: Date,
    updatedAt: Date,
    scanType: string,
    startTime: Date,
    endTime: Date,
    containers: ContainerDto[],
    progress: number,
    step: string,
    vulnerabilityDetected: number,
  ) {
    this.id = id;
    this.name = name;
    this.state = state;
    this.language = language;
    this.projectId = projectId;
    this.private = privateScan;
    this.initializerUserId = initializerUserId;
    this.createAt = createAt;
    this.updatedAt = updatedAt;
    this.scanType = scanType;
    this.startTime = startTime;
    this.endTime = endTime;
    this.containers = containers;
    this.progress = progress;
    this.step = step;
    this.vulnerabilityDetected = vulnerabilityDetected;
  }

  public toString(): string {
    return JSON.stringify(this);
  }
}

