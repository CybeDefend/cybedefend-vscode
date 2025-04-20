export class ProjectCreateRequestDto {
  readonly name: string;

  readonly teamId: string;

  readonly creatorId: string;

  constructor(name: string, teamId: string, creatorId: string) {
    this.name = name;
    this.teamId = teamId;
    this.creatorId = creatorId;
  }

  public toString(): string {
    return JSON.stringify({
      name: this.name,
      teamId: this.teamId,
      creatorId: this.creatorId,
    });
  }
}