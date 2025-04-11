export class MessageDto {
  role: string;

  content: string;

  createdAt: Date;

  constructor(role: string, content: string, createdAt: Date) {
    this.role = role;
    this.content = content;
    this.createdAt = createdAt;
  }
}
