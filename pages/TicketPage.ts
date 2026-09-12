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
    await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await this.page
      .locator("#talks")
      .waitFor({
        state: "attached",
        timeout: 15_000,
      })
      .catch(() => {});
  }

  async readDetails(): Promise<TicketDetails> {
    const title = await this.readTitle();

    if (!title) {
      throw new Error("Helpical ticket title was not found");
    }

    const status = await this.readStatus();
    const messages = await this.readMessages();

    return {
      title,
      status,
      messages,
      latestMessage: messages.at(-1) ?? null,
    };
  }

  private async readTitle(): Promise<string> {
    // عنوان اصلی تیکت در صفحه واقعی Helpical
    const titleLocator = this.page.locator(
      "#talks .panel-heading strong",
    ).first();

    if ((await titleLocator.count()) > 0) {
      const text = normalizeText(
        (await titleLocator.textContent()) ?? "",
      );

      if (text) {
        // نمونه:
        // تیکت ۶۱۹۷۲ | پرونده های خطادار
        const separatorIndex = text.indexOf("|");

        if (separatorIndex >= 0) {
          const title = normalizeText(
            text.slice(separatorIndex + 1),
          );

          if (title) {
            return title;
          }
        }
      }
    }

    // fallback برای fixture / ساختارهای دیگر
    const ticketTitle = this.page
      .locator(".ticket-title")
      .first();

    if ((await ticketTitle.count()) > 0) {
      const text = normalizeText(
        (await ticketTitle.textContent()) ?? "",
      );

      return normalizeText(
        text.replace(/^عنوان\s*:\s*/i, ""),
      );
    }

    return "";
  }

  private async readMessages(): Promise<TicketMessage[]> {
    const holders = this.page.locator(
      "#talks .talks-holder",
    );

    const messages: TicketMessage[] = [];

    for (const holder of await holders.all()) {
      try {
        const message =
          await this.parseMessage(holder);

        messages.push(message);
      } catch {
        // یک پیام خراب نباید کل تیکت را متوقف کند.
      }
    }

    return messages;
  }

  private async parseMessage(
    holder: Locator,
  ): Promise<TicketMessage> {
    const boxTitle = holder.locator(".box-title").first();

    const author = await this.readAuthor(boxTitle);
    const date = await this.readDate(boxTitle);

    const panelBody = holder
      .locator(".panel-body")
      .first();

    const messageBody =
      (await panelBody.count()) > 0
        ? panelBody
        : holder;

    const statusLocator = messageBody
      .locator("small")
      .filter({
        hasText: "وضعیت تیکت",
      })
      .last();

    let status = "";

    if ((await statusLocator.count()) > 0) {
      status = normalizeText(
        (await statusLocator.textContent()) ?? "",
      );

      status = normalizeText(
        status.replace(
          /^وضعیت تیکت\s*:\s*/i,
          "",
        ),
      );
    }

    const text = await this.readMessageText(
      messageBody,
      statusLocator,
    );

    if (!text) {
      throw new Error(
        "Helpical ticket message text was not found",
      );
    }

    const holderClass =
      (await holder.getAttribute("class")) ?? "";

    let senderType:
      | "S"
      | "C"
      | undefined;

    if (holderClass.includes("success-box")) {
      senderType = "S";
    } else if (
      holderClass.includes("gray-box") &&
      (await holder
        .locator(".box-title > span")
        .count()) === 0
    ) {
      senderType = "C";
    }

    return {
      author,
      date,
      text,
      status: status || null,
      ...(senderType
        ? { senderType }
        : {}),
    };
  }

  private async readAuthor(boxTitle: Locator): Promise<string> {
    const holder = boxTitle.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' talks-holder ')][1]");
    const heading = holder.locator("h3, .talk-author, .author").first();
    if ((await heading.count()) > 0) {
      const headingText = normalizeText((await heading.textContent()) ?? "");
      if (headingText) return headingText;
    }
    if ((await boxTitle.count()) === 0) {
      return "";
    }

    const text = normalizeText(
      (await boxTitle.textContent()) ?? "",
    );

    if (!text) {
      return "";
    }

    /*
     * ساختار واقعی:
     *
     * مهرشاد شیخ الاسلامی
     * (۱۴۰۵/۰۶/۱۷ ۱۹:۱۷:۰۵)
     * پاسخ ۴
     *
     * بنابراین قسمت قبل از تاریخ را استخراج می‌کنیم.
     */

    const dateIndex = text.search(
      /[\(（]\s*[\d۰-۹]{4}[\/\-][\d۰-۹]{1,2}[\/\-][\d۰-۹]{1,2}/,
    );

    if (dateIndex >= 0) {
      const author = normalizeText(
        text.slice(0, dateIndex),
      );

      return author;
    }

    return text;
  }

  private async readDate(boxTitle: Locator): Promise<string> {
    const semanticTime = boxTitle.locator("time").first();
    if ((await semanticTime.count()) > 0) {
      const datetime = normalizeText((await semanticTime.getAttribute("datetime")) ?? "");
      if (datetime) return datetime;
      const text = normalizeText((await semanticTime.textContent()) ?? "");
      if (text) return text;
    }
    const time = boxTitle.locator("small.pe").first();

    if ((await time.count()) > 0) {
      const value = normalizeText(
        (await time.textContent()) ?? "",
      );

      if (value) {
        return value;
      }
    }

    const text = normalizeText(
      (await boxTitle.textContent()) ?? "",
    );

    const match = text.match(
      /[\(（]\s*([\d۰-۹]{4}[\/\-][\d۰-۹]{1,2}[\/\-][\d۰-۹]{1,2}\s+[\d۰-۹]{1,2}:[\d۰-۹]{2}(?::[\d۰-۹]{2})?)\s*[\)）]/,
    );

    return match?.[1] ? normalizeText(match[1]) : "";
  }

  private async readMessageText(
    body: Locator,
    statusLocator: Locator,
  ): Promise<string> {
    const message = body.locator(".message").first();
    if ((await message.count()) > 0) {
      return normalizeText((await message.textContent()) ?? "");
    }
    return normalizeText(
      await body.evaluate(
        (element, removeStatus) => {
          const clone = element.cloneNode(true) as HTMLElement;

          const hr = clone.querySelector("hr");
          hr?.remove();

          if (removeStatus) {
            clone
              .querySelectorAll("small")
              .forEach((element) => element.remove());
          }

          return clone.textContent ?? "";
        },
        (await statusLocator.count()) > 0,
      ),
    );
  }

  private async readStatus(): Promise<string> {
    const status = this.page
      .locator("#ticket-status-des strong")
      .first();

    if ((await status.count()) > 0) {
      return normalizeText(
        (await status.textContent()) ?? "",
      );
    }

    const fallback = this.page
      .locator("#ticket-status-des")
      .first();

    if ((await fallback.count()) > 0) {
      const text = normalizeText(
        (await fallback.textContent()) ?? "",
      );

      return normalizeText(
        text.replace(/^وضعیت تیکت\s*:\s*/i, ""),
      );
    }

    return "";
  }
}
