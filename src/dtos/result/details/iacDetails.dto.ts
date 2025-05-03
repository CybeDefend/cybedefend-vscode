// src/dtos/result/details/iacDetails.dto.ts
import { BaseVulnerabilityDetectionDto, VulnerabilityMetadataDto, CodeSnippetDto, HistoryItemDto } from './commonDetails.dto';

export interface IacVulnerabilityDetectionDto extends BaseVulnerabilityDetectionDto {
    contextualExplanation?: string | null;
    language: string;
    path: string;
    vulnerableStartLine: number;
    vulnerableEndLine: number;
    scannerType: string;
    vulnerability: VulnerabilityMetadataDto;
    codeSnippets: CodeSnippetDto[];
    // No data flow items for IaC
}