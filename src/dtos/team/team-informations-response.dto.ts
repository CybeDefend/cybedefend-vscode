export class TeamInformationsResponseDto {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  readonly createdAt: Date;

  readonly updatedAt: Date;

  constructor(
    id: string,
    name: string,
    description: string,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  public toString(): string {
    return JSON.stringify({
      id: this.id,
      name: this.name,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }
}
