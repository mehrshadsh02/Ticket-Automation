import type { Locator, Page } from "@playwright/test";
import type { TicketMessage } from "../models/TicketMessage.js";
import { normalizeText } from "../utils/text.js";

export interface TicketDetails {
  readonly title: string;
  readonly status: string;
  readonly messages: readonly TicketMessage[];
  readonly latestMessage: TicketMessage | null;
}

export class TicketPage {
  constructor(private readonly page: Page) {}

  async open(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async readDetails(): Promise<TicketDetails> {
    const title = normalizeText(
      await this.page
        .locator('.ticket-title, [itemprop="name"], main h1, main h2')
        .first()
        .textContent(),
    );
    if (!title) throw new Error("Helpical ticket title was not found");

    const status = await this.readStatus();
    const messages = await this.readMessages();
    return { title, status, messages, latestMessage: messages.at(-1) ?? null };
  }

  private async readMessages(): Promise<TicketMessage[]> {
    // Helpical renders each conversation entry as a .talks-holder under #talks.
    // Scope by class instead of the historically duplicated talks-holder IDs.
    const holders = this.page.locator(
      "#talks .talks-holder, main .talks-holder",
    );
    const messages: TicketMessage[] = [];
    for (const holder of await holders.all())
      messages.push(await this.parseMessage(holder));
    return messages;
  }

  private async parseMessage(holder: Locator): Promise<TicketMessage> {
    const author = normalizeText(
      await holder
        .locator('h3, .box-title strong, [rel="author"], [data-author]')
        .first()
        .textContent(),
    );
    const metadata = normalizeText(
      await holder.locator(".box-title, time, .gray-des").first().textContent(),
    );
    const explicitDate = normalizeText(
      (await holder.locator("time").first().getAttribute("datetime")) ??
        (await holder.locator("[data-date]").first().getAttribute("data-date")),
    );
    const text = normalizeText(
      await holder
        .locator('.message, .talk-message, [itemprop="text"]')
        .first()
        .textContent(),
    );
    const statusLocator = holder
      .locator("[data-status], .ticket-status, .status")
      .first();
    const status =
      (await statusLocator.count()) > 0
        ? normalizeText(await statusLocator.textContent())
        : "";
    if (!text) throw new Error("Helpical ticket message text was not found");
    return {
      author,
      date: explicitDate || metadata,
      text,
      status: status || null,
    };
  }

  private async readStatus(): Promise<string> {
    const status = this.page
      .locator("#ticket-status-des, [data-ticket-status], .ticket-status")
      .first();
    return (await status.count()) > 0
      ? normalizeText(await status.textContent())
      : "";
  }
}
