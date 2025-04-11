// src/dtos/result/details/sastDetails.dto.ts
import { BaseVulnerabilityDetectionDto, VulnerabilityMetadataDto, CodeSnippetDto, HistoryItemDto, DataFlowItemDto } from './commonDetails.dto';

export interface SastVulnerabilityDetectionDto extends BaseVulnerabilityDetectionDto {
    contextualExplanation?: string | null;
    language: string;
    path: string;
    vulnerableStartLine: number;
    vulnerableEndLine: number;
    scannerType: string;
    fileHash?: string | null;
    vulnerability: VulnerabilityMetadataDto; // Contient le type 'sast'
    // vulnerabilityDetectionHistory: any[]; // Ajoute si nécessaire
    codeSnippets: CodeSnippetDto[];
    dataFlowItems: DataFlowItemDto[];
}