// src/dtos/result/details/commonDetails.dto.ts
// Éléments communs trouvés dans plusieurs entités détaillées

// Basé sur UserDto (présent dans HistoryItem)
export interface UserInfoDto {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    picture: string;
}

// Basé sur CodeLineDto (présent dans CodeSnippetDto, DataFlowItemDto)
// Attention: 'code' est JSON dans l'entité, ici on le type comme objet ou string
export interface CodeLineDto {
    line: number;
    content: string;
}

// Basé sur CodeSnippet entity
export interface CodeSnippetDto {
    id: string;
    vulnerableStartLine: number;
    vulnerableEndLine: number;
    startLine: number;
    endLine: number;
    code: CodeLineDto[]; // L'entité a 'json', on suppose un tableau ici
    language: string;
    fixAnalysis?: string | null;
    fixAnalysisDescription?: string | null;
}

// Basé sur HistoryItem entity
export interface HistoryItemDto {
    id: string;
    type: string;
    value: string;
    date: string; // Ou Date si sérialisé comme tel
    userId?: string | null;
    user?: UserInfoDto | null;
}

// Basé sur DataFlowItem entity
export interface DataFlowItemDto {
    id: string;
    nameHighlight: string;
    line: number;
    language: string;
    code: CodeLineDto[]; // L'entité a 'json', on suppose un tableau ici
    type: string; // 'source', 'sink', 'intermediate', etc.
    order: number;
}

// Basé sur l'entité Vulnerability (la partie métadonnées)
export interface VulnerabilityMetadataDto {
    id: string;
    cwe: string[];
    name: string;
    shortDescription: string;
    description: string;
    howToPrevent: string;
    owaspTop10?: string[] | null;
    severity: string; // Tu devrais peut-être utiliser un Enum ici aussi
    language: string;
    vulnerabilityType: 'sast' | 'iac' | 'sca'; // Type discriminant !
    // references: ReferencesDto[]; // Si tu as besoin des références
}

// Enum possible pour la sévérité (basé sur les commentaires)
export enum VulnerabilitySeverityEnum {
    CRITICAL = 'CRITICAL',
    HIGH = 'HIGH',
    MEDIUM = 'MEDIUM',
    LOW = 'LOW',
    INFO = 'INFO', // Ajout possible
    UNKNOWN = 'UNKNOWN'
}

// Enum possible pour le statut (basé sur ScaVulnerabilityDetections)
 export enum VulnerabilityStatusEnum {
     TO_VERIFY = 'to_verify',
     NOT_EXPLOITABLE = 'not_exploitable',
     PROPOSED_NOT_EXPLOITABLE = 'proposed_not_exploitable',
     RESOLVED = 'resolved',
     CONFIRMED = 'confirmed'
 }

 // Enum possible pour la priorité (basé sur les commentaires)
  export enum VulnerabilityPriorityEnum {
      CRITICAL_URGENT = 'Critical Urgent',
      URGENT = 'Urgent',
      NORMAL = 'Normal',
      LOW = 'Low',
      VERY_LOW = 'Very Low',
      UNKNOWN = 'UNKNOWN'
  }

// --- Interface de base pour les détections ---
// Contient les champs communs à SAST, IAC, SCA detections
export interface BaseVulnerabilityDetectionDto {
    id: string;
    projectId: string;
    createdAt: string; // Ou Date
    updateAt: string; // Ou Date
    timeToFix?: string | null;
    currentState: string; // Utilise VulnerabilityStatusEnum ?
    currentSeverity: string; // Utilise VulnerabilitySeverityEnum ?
    currentPriority: string; // Utilise VulnerabilityPriorityEnum ?
    historyItems: HistoryItemDto[];
    // Tu pourrais ajouter vulnerabilityType ici comme discriminateur si l'API le fournit au niveau détection
}