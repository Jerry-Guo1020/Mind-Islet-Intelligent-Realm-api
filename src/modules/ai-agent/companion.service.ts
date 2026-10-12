import { Inject, Injectable } from '@nestjs/common';
import { MoodType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { shanghaiDate } from '../../common/crypto.util';
import { MODEL_CLIENT, type ModelClient } from '../model/model.client';
import type { ChatTurn } from '../model/model.client';
import { parseTriage, replyMessages, triageMessages } from './prompts';

export const FALLBACK_REPLY = '我在这里。今天先不用想太多，我们慢慢说。';

export interface CompanionTurnInput {
  userId: string;
  message: string;
  currentMood?: string;
}

@Injectable()
export class CompanionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MODEL_CLIENT) private readonly model: ModelClient,
  ) {}

  private readonly env = {
    small: process.env.AI_SMALL_MODEL || 'small-model',
    large: process.env.AI_LARGE_MODEL || 'large-model',
  };

  async respond(
    input: CompanionTurnInput,
    emit: (event: { type: 'delta' | 'finish'; text?: string }) => void,
  ) {
    const message = input.message.trim();
    if (!message) {
      emit({ type: 'delta', text: FALLBACK_REPLY });
      emit({ type: 'finish' });
      return;
    }

    let triageRaw = '';
    try {
      triageRaw = await this.model.complete(
        this.env.small,
        triageMessages({ message, mood: input.currentMood }),
      );
    } catch {
      triageRaw = '';
    }
    const triage = parseTriage(triageRaw);
    if (!triage) {
      await this.persist(input.userId, message, FALLBACK_REPLY);
      emit({ type: 'delta', text: FALLBACK_REPLY });
      emit({ type: 'finish' });
      return;
    }

    const history = await this.recentHistory(input.userId);
    const today = await this.todayContext(input.userId);
    let reply = '';
    try {
      reply = await this.model.stream(
        this.env.large,
        replyMessages({ strategy: triage.strategy, history, message, today }),
        (text) => emit({ type: 'delta', text }),
      );
    } catch {
      reply = '';
    }
    if (!reply.trim()) {
      emit({ type: 'delta', text: FALLBACK_REPLY });
      reply = FALLBACK_REPLY;
    }
    await this.persist(input.userId, message, reply);
    emit({ type: 'finish' });
  }

  private async recentHistory(userId: string): Promise<ChatTurn[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return rows
      .reverse()
      .map((row) => ({ role: row.role, content: row.content }));
  }

  private async todayContext(userId: string) {
    const record = await this.prisma.checkInRecord.findUnique({
      where: { userId_checkInDate: { userId, checkInDate: shanghaiDate() } },
    });
    if (!record) return undefined;
    const weather =
      record.moodType === MoodType.anxious || record.moodType === MoodType.sad
        ? 'rain'
        : 'sunny';
    return {
      moodType: record.moodType,
      content: record.content,
      aiReply: record.aiReply,
      weather,
    };
  }

  private async persist(userId: string, message: string, reply: string) {
    await this.prisma.chatMessage.createMany({
      data: [
        { userId, role: 'user', content: message },
        { userId, role: 'assistant', content: reply },
      ],
    });
  }
}
