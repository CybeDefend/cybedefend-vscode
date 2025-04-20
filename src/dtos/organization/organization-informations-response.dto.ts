export class OrganizationInformationsResponseDto {
  readonly id: string;

  readonly name: string;

  readonly description: string;

  readonly website: string;

  readonly email: string;

  monthlyScanCount: number;

  monthlyScanResetAt: Date;

  concurrentScanLimit: number;

  monthlyScanLimit: number;

  constructor(
    id: string,
    name: string,
    description: string,
    website: string,
    email: string,
    monthlyScanCount?: number,
    monthlyScanResetAt?: Date,
    concurrentScanLimit?: number,
    monthlyScanLimit?: number
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.website = website;
    this.email = email;
    this.monthlyScanCount = monthlyScanCount ?? 0;
    this.monthlyScanResetAt = monthlyScanResetAt ?? new Date();
    this.concurrentScanLimit = concurrentScanLimit ?? 1;
    this.monthlyScanLimit = monthlyScanLimit ?? 1000;
  }

  public toString(): string {
    return JSON.stringify({
      id: this.id,
      name: this.name,
      description: this.description,
      website: this.website,
      email: this.email,
      monthlyScanCount: this.monthlyScanCount,
      monthlyScanResetAt: this.monthlyScanResetAt,
      concurrentScanLimit: this.concurrentScanLimit,
      monthlyScanLimit: this.monthlyScanLimit,
    });
  }
}
