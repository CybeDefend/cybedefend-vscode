// src/dtos/result/details/scaDetails.dto.ts
import { BaseVulnerabilityDetectionDto, HistoryItemDto } from './commonDetails.dto';
// Importe les sous-DTOs SCA depuis get-project-vulnerability-by-id-response.dto.ts
// Ou redéfinis-les ici si tu préfères séparer. Assumons qu'ils sont déjà définis.
import {
    ScaDetectedLibraryDto, // Renomme peut-être ScaDetectedPackageDto ? basé sur l'entité
    VulnerabilityScaMetadataDto // Le DTO spécifique SCA qui hérite de VulnerabilityMetadataDto
                                 // Assure-toi qu'il est bien défini dans tes DTOs existants
                                 // Ou crée-le ici en te basant sur l'entité VulnerabilitySca
} from '../../result/response/get-project-vulnerability-by-id-response.dto'; // Ajuste le chemin


export interface ScaVulnerabilityDetectionDto extends BaseVulnerabilityDetectionDto {
    // Pas de path/line direct, l'info est dans scaDetectedPackage
    scaDetectedPackage?: ScaDetectedLibraryDto; // Ou ScaDetectedPackages si tu renommes
    vulnerability: VulnerabilityScaMetadataDto; // Contient le type 'sca' et les détails riches
    // vulnerabilityDetectionHistory: any[]; // Ajoute si nécessaire
}

// Type spécifique mentionné par l'utilisateur
export interface ScaVulnerabilityWithCvssDto extends ScaVulnerabilityDetectionDto {
    cvssScore?: number; // Rends optionnel car pas dans l'entité ScaVulnerabilityDetections
                       // L'API doit calculer/ajouter ce champ si tu veux l'utiliser
}