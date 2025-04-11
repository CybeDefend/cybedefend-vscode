export class GetMainStatisticsRequestDto {
  projectIds: string[];

  constructor(projectIds: string[]) {
    this.projectIds = projectIds;
  }

  toString() {
    return JSON.stringify(this);
  }
}
