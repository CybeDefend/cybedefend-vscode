export class GetProjectOverviewRequestDto {
  projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  toString() {
    return JSON.stringify(this);
  }
}
