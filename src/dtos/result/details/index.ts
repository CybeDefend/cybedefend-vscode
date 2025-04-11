// src/dtos/result/details/index.ts
export * from './commonDetails.dto';
export * from './sastDetails.dto';
export * from './iacDetails.dto';
export * from './scaDetails.dto';

import { IacVulnerabilityDetectionDto } from './iacDetails.dto';
import { SastVulnerabilityDetectionDto } from './sastDetails.dto';
import { ScaVulnerabilityWithCvssDto } from './scaDetails.dto';

// --- Le type Union à utiliser dans l'application ---
export type DetailedVulnerability = SastVulnerabilityDetectionDto | IacVulnerabilityDetectionDto | ScaVulnerabilityWithCvssDto;