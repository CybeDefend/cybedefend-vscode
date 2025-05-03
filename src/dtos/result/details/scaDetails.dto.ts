// src/dtos/result/details/scaDetails.dto.ts
import { BaseVulnerabilityDetectionDto, HistoryItemDto } from './commonDetails.dto';
import {
    ScaDetectedLibraryDto,
    VulnerabilityScaMetadataDto
} from '../../result/response/get-project-vulnerability-by-id-response.dto';


export interface ScaVulnerabilityDetectionDto extends BaseVulnerabilityDetectionDto {
    scaDetectedPackage?: ScaDetectedLibraryDto;
    vulnerability: VulnerabilityScaMetadataDto;
}

// Type spécifique mentionné par l'utilisateur
export interface ScaVulnerabilityWithCvssDto extends ScaVulnerabilityDetectionDto {
    cvssScore?: number;
}