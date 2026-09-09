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
      "#talks > .panel > .panel-body > .talks-holder",
    );

    const count = await holders.count();

    // fallback برای fixture فعلی تست
    const fallbackHolders =
      count > 0
        ? holders
        : this.page.locator(
            "#talks .talks-holder, main .talks-holder",
          );

    const messages: TicketMessage[] = [];

    for (const holder of await fallbackHolders.all()) {
      try {
        messages.push(await this.parseMessage(holder));
      } catch {
        // یک پیام خراب نباید باعث توقف کل تیکت شود.
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

    const messageBody = holder
      .locator(".panel-body")
      .first();

    if ((await messageBody.count()) === 0) {
      throw new Error(
        "Helpical ticket message body was not found",
      );
    }

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
        status.replace(/^وضعیت تیکت\s*:\s*/i, ""),
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

    return {
      author,
      date,
      text,
      status: status || null,
    };
  }

  private async readAuthor(boxTitle: Locator): Promise<string> {
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