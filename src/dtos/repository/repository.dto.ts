export class RepositoryDto {
  name: string;
  fullName: string;
  id: string;
  githubId: number;
  private: boolean;
  projectId: string;
  constructor(name: string, fullName: string, id: string, githubId: number, privateRepo: boolean, projectId: string) {
    this.name = name;
    this.fullName = fullName;
    this.id = id;
    this.githubId = githubId;
    this.private = privateRepo;
    this.projectId = projectId;
  }
  public toString(): string {
    return JSON.stringify({
      name: this.name,
      fullName: this.fullName,
      id: this.id,
      githubId: this.githubId,
      private: this.private,
      projectId: this.projectId,
    });
  }
}
