// src/global-management/scan/body/get-scan-request.dto.ts

export class GetScanRequestDto {
  scanId: string;

  constructor(scanId: string) {
    this.scanId = scanId;
  }

  toString(): string {
    return JSON.stringify(this);
  }
}
