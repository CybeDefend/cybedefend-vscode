import { RepositoryDto } from './repository.dto';
export class RepositoryInstallationDto {
  repository: RepositoryDto[];
  installationId: number;
  constructor(repository: RepositoryDto[], installationId: number) {
    this.repository = repository;
    this.installationId = installationId;
  }
  public toString(): string {
    return JSON.stringify({
      repository: this.repository,
      installationId: this.installationId,
    });
  }
}
