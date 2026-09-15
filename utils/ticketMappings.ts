import type { PriorityCode, StatusCode } from "../models/Ticket.js";
import { normalizeText } from "./text.js";
import type { TicketStatusKey } from "../models/Ticket.js";

function normalizePersian(value: string): string {
  return normalizeText(value)
    .replace(/\u200c/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ـ/g, "");
}

export function statusCodeFor(value: string): StatusCode {
  const normalized = normalizePersian(value).replace(
    /^وضعیت\s*تیکت\s*:\s*/,
    "",
  );
  const mappings: Readonly<Record<string, StatusCode>> = {
    باز: 0,
    "پاسخ داده شده": 1,
    "پاسخ داده شد": 1,
    "پاسخ ایجاد کننده تیکت": 2,
    "بسته شده": 3,
    بسته: 3,
    "در حال بررسی": 0,
  };
  const code = mappings[normalized];
  if (code === undefined) {
    throw new Error(`Unsupported Helpical ticket status: ${value}`);
  }
  return code;
}

export function statusKeyFor(value: string): TicketStatusKey {
  const normalized = value
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  switch (normalized) {
    case "باز":
      return "open";

    case "در حال بررسی":
      return "in_review";

    case "پاسخ ایجاد کننده تیکت":
      return "creator_reply";

    case "پاسخ داده شده":
      return "answered";

    case "بسته شده":
      return "closed";

    default:
      throw new Error(`Unknown ticket status: ${value}`);
  }
}

export function priorityCodeFor(value: string): PriorityCode {
  const normalized = normalizePersian(value);
  const mappings: Readonly<Record<string, PriorityCode>> = {
    بحرانی: "C",
    بالا: "H",
    پایین: "L",
    عادی: "N",
    فوری: "C",
  };
  const code = mappings[normalized];
  if (code === undefined) {
    throw new Error(`Unsupported Helpical ticket priority: ${value}`);
  }
  return code;
}

