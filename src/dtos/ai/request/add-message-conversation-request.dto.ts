export class AddMessageConversationRequestDto {
  projectId: string;

  idConversation: string;

  message: string;

  constructor(idConversation: string, message: string, projectId?: string) {
    this.idConversation = idConversation;
    this.message = message;
    this.projectId = projectId || '';
  }

  public toString(): string {
    return JSON.stringify({
      idConversation: this.idConversation,
      message: this.message,
      projectId: this.projectId,
    });
  }
}
