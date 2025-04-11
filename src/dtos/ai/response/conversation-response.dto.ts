import { MessageDto } from './message.dto';

export class ConversationResponseDto {
  conversationId: string;

  messages: MessageDto[];

  constructor(conversationId: string, messages: MessageDto[]) {
    this.conversationId = conversationId;
    this.messages = messages;
  }

  public toString(): string {
    return JSON.stringify({
      conversationId: this.conversationId,
      messages: this.messages,
    });
  }
}
