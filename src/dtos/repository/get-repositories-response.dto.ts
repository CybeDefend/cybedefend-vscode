
import { RepositoryInstallationDto } from './repository-installation.dto';
export class GetRepositoriesResponseDto {
  repositories: RepositoryInstallationDto[];
  organizationId: string;
  constructor(repositories: RepositoryInstallationDto[], organizationId: string) {
    this.repositories = repositories;
    this.organizationId = organizationId;
  }
  public toString(): string {
    return JSON.stringify({
      repositories: this.repositories,
      organizationId: this.organizationId,
    });
  }
}
