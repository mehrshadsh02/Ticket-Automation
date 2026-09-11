import { expect, test } from "@playwright/test";
import { priorityCodeFor, statusCodeFor } from "../../utils/ticketMappings.js";

test("maps Helpical status labels to stable codes", () => {
  expect(statusCodeFor("باز")).toBe(0);
  expect(statusCodeFor("وضعیت تیکت: پاسخ داده شده")).toBe(1);
  expect(statusCodeFor("پاسخ ایجاد کننده تیکت")).toBe(2);
  expect(statusCodeFor("بسته شده")).toBe(3);
  expect(() => statusCodeFor("نامشخص")).toThrow(/Unsupported/);
});

test("maps Helpical priority labels to stable codes", () => {
  expect(priorityCodeFor("بحرانی")).toBe("C");
  expect(priorityCodeFor("بالا")).toBe("H");
  expect(priorityCodeFor("پایین")).toBe("L");
  expect(priorityCodeFor("عادی")).toBe("N");
  expect(() => priorityCodeFor("نامشخص")).toThrow(/Unsupported/);
});
