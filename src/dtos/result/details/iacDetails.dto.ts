// src/dtos/result/details/iacDetails.dto.ts
import { BaseVulnerabilityDetectionDto, VulnerabilityMetadataDto, CodeSnippetDto, HistoryItemDto } from './commonDetails.dto';

export interface IacVulnerabilityDetectionDto extends BaseVulnerabilityDetectionDto {
    contextualExplanation?: string | null;
    language: string;
    path: string;
    vulnerableStartLine: number;
    vulnerableEndLine: number;
    scannerType: string;
    vulnerability: VulnerabilityMetadataDto; // Contient le type 'iac'
    // vulnerabilityDetectionHistory: any[]; // Ajoute si nécessaire
    codeSnippets: CodeSnippetDto[];
    // Pas de dataFlowItems pour IAC selon l'entité
}