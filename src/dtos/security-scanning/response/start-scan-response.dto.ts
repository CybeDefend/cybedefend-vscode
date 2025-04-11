export class StartScanResponseDto {
  success: boolean;

  message: string;
  
  detectedLanguages?: string[];

  constructor(
    success: boolean,
    message: string,
    detectedLanguages?: string[],
  ) {
    this.success = success;
    this.message = message;
    this.detectedLanguages = detectedLanguages;
  }

  public toString(): string {
    return JSON.stringify(this);
  }
}
