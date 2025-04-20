// src/github-service/body/link-repository-request.dto.ts

export class LinkRepositoryRequestDto {
  organizationId: string;
  projectId: string;
  repositoryId: string;
  constructor(
    organizationId: string,
    projectId: string,
    repositoryId: string
  ) {
    this.repositoryId = repositoryId;
    this.organizationId = organizationId;
    this.projectId = projectId;
  }
  public toString(): string {
    return JSON.stringify({
      organizationId: this.organizationId,
      projectId: this.projectId,
      repositoryId: this.repositoryId,
    });
  }
}
