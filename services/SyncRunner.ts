import { chromium, type Browser } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { LoginPage } from "../pages/LoginPage.js";
import { TicketListPage } from "../pages/TicketListPage.js";
import { TicketPage } from "../pages/TicketPage.js";
import { TicketCollector } from "./TicketCollector.js";
import { TicketProcessor } from "./TicketProcessor.js";
import { TicketRepository } from "../storage/TicketRepository.js";
import type { AppConfig } from "../config/env.js";
import { centers } from "../config/centers.js";
import { createTodoService } from "./createTodoService.js";
import { createLogger } from "../utils/logger.js";
import { createTicketSyncService } from "./createTicketSyncService.js";

export async function runSync(
  config: AppConfig,
): Promise<void> {
  const logger = createLogger(config.LOG_LEVEL);
  const started = Date.now();
  const lock = `${config.DATABASE_PATH}.lock`;

  if (fs.existsSync(lock)) {
    const pidFile = path.join(lock, "pid");

    if (fs.existsSync(pidFile)) {
      const pid = Number(
        fs.readFileSync(pidFile, "utf-8"),
      );

      try {
        process.kill(pid, 0);
        logger.warn({
          event: "sync_skipped_locked",
        });
        return;
      } catch {
        logger.warn({
          event: "stale_lock_removed",
        });

        fs.rmSync(lock, {
          recursive: true,
          force: true,
        });
      }
    }
  }

  fs.mkdirSync(lock);
  fs.writeFileSync(
    path.join(lock, "pid"),
    String(process.pid),
  );

  const repo = new TicketRepository(
    config.DATABASE_PATH,
  );

  let browser: Browser | undefined;

  const stats = {
    found: 0,
    new: 0,
    changed: 0,
    created: 0,
    updated: 0,
    completed: 0,
    reopened: 0,
    errors: 0,
  };

  logger.info({
    event: "sync_start",
  });

  try {
    browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      slowMo: 500,
    });

    const page = await browser.newPage();

    logger.info({
      event: "login_start",
    });

    const login = new LoginPage(
      page,
      config.HELPICAL_BASE_URL,
    );

    await login.open();

    await login.login(
      config.HELPICAL_USERNAME,
      config.HELPICAL_PASSWORD,
    );

    login.assertLoggedIn();

    logger.info({
      event: "login_success",
    });

    logger.info({
      event: "navigate_to_tickets",
    });

    const ticketListPage =
      new TicketListPage(
        page,
        config.HELPICAL_BASE_URL,
      );

    await ticketListPage.open();

    const collector =
      new TicketCollector(
        ticketListPage,
        new TicketPage(page),
        centers,
      );

    const processor =
      new TicketProcessor(
        repo,
        createTodoService(config),
      );

    const syncService =
      createTicketSyncService(
        config,
        processor,
      );

    logger.info({
      event: "collect_tickets_start",
    });

    const tickets =
      await collector.collect();

    stats.found = tickets.length;

    logger.info({
      event: "collect_tickets_done",
      count: tickets.length,
    });

    for (const ticket of tickets) {
      try {
        const before =
          repo.findById(ticket.id);

        const result =
          await syncService.process(ticket);

        if (!before) {
          stats.new++;
        } else if (
          result.outcome !== "unchanged"
        ) {
          stats.changed++;
        }

        if (
          result.outcome === "created"
        ) {
          stats.created++;
        }

        if (
          result.outcome === "updated"
        ) {
          stats.updated++;
        }

        if (
          result.transition === "complete"
        ) {
          stats.completed++;
        }

        if (
          result.transition === "reopen"
        ) {
          stats.reopened++;
        }
      } catch (error) {
        stats.errors++;

        logger.error({
          event: "ticket_error",
          ticketId: ticket.id,
          error: String(error),
        });
      }
    }
  } catch (error) {
    stats.errors++;

    logger.error({
      event: "sync_error",
      error: String(error),
      stack: (error as Error)?.stack,
    });
  } finally {
    await browser?.close();

    repo.close();

    try {
      fs.rmSync(lock, {
        recursive: true,
        force: true,
      });
    } catch {
      // best effort
    }

    logger.info({
      event: "sync_complete",
      durationMs: Date.now() - started,
      ...stats,
    });
  }
}