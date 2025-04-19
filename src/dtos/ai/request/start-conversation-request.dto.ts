export class StartConversationRequestDto {
  isVulnerabilityConversation: boolean = false;

  projectId?: string;

  vulnerabilityId?: string;

  vulnerabilityType?: 'sast' | 'iac' | 'sca';

  constructor(partial?: Partial<StartConversationRequestDto>) {
    Object.assign(this, partial);
  }

  public toString(): string {
    return JSON.stringify({
      isVulnerabilityConversation: this.isVulnerabilityConversation,
      projectId: this.projectId,
      vulnerabilityId: this.vulnerabilityId,
      vulnerabilityType: this.vulnerabilityType,
    });
  }
}
