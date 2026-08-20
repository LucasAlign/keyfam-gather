import type { DeliveryChannel, DeliveryStatus } from "@prisma/client";

export type { DeliveryChannel, DeliveryStatus };

export type DeliveryMessage = {
  channel: DeliveryChannel;
  to: string;
  subject?: string;
  body: string;
};

export type DeliveryResult = {
  status: DeliveryStatus;
  providerMessageId?: string;
  error?: string;
};

export interface DeliveryProvider {
  name: string;
  send(message: DeliveryMessage): Promise<DeliveryResult>;
}
