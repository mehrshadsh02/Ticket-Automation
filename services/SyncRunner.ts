import { chromium, type Browser } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { TicketListPage } from '../pages/TicketListPage.js';
import { TicketPage } from '../pages/TicketPage.js';
import { TicketCollector } from './TicketCollector.js';
import { TicketProcessor } from './TicketProcessor.js';
import { TicketRepository } from '../storage/TicketRepository.js';
import type { AppConfig } from '../config/env.js';
import { centers } from '../config/centers.js';
import { createTodoService } from './createTodoService.js';
import { createLogger } from '../utils/logger.js';
import fs from 'node:fs';

export async function runSync(config: AppConfig): Promise<void> {
  const logger = createLogger(config.LOG_LEVEL); const started = Date.now();
  const lock = `${config.DATABASE_PATH}.lock`;
  try { fs.mkdirSync(lock, { recursive: false }); } catch { logger.warn({ event: 'sync_skipped_locked' }); return; }
  const repo = new TicketRepository(config.DATABASE_PATH); let browser: Browser | undefined;
  const stats = { found: 0, new: 0, changed: 0, created: 0, updated: 0, completed: 0, reopened: 0, errors: 0 };
  logger.info({ event: 'sync_start' });
  try {
    browser = await chromium.launch({channel: 'chrome', headless: true }); const page = await browser.newPage();
    const login = new LoginPage(page, config.HELPICAL_BASE_URL); await login.open(); await login.login(config.HELPICAL_USERNAME, config.HELPICAL_PASSWORD); await login.assertLoggedIn();
    const collector = new TicketCollector(new TicketListPage(page, config.HELPICAL_BASE_URL), new TicketPage(page), centers);
    const processor = new TicketProcessor(repo, createTodoService(config)); const tickets = await collector.collect(); stats.found = tickets.length;
    for (const ticket of tickets) { try { const before = repo.findById(ticket.id); const result = await processor.process(ticket); if (!before) stats.new++; else if (result.outcome !== 'unchanged') stats.changed++; if (result.outcome === 'created') stats.created++; if (result.outcome === 'updated') stats.updated++; if (result.transition === 'complete') stats.completed++; if (result.transition === 'reopen') stats.reopened++; } catch (error) { stats.errors++; logger.error({ event: 'ticket_error', ticketId: ticket.id, error: String(error) }); } }
  } catch (error) { stats.errors++; logger.error({ event: 'sync_error', error: String(error) }); }
  finally { await browser?.close(); repo.close(); try { fs.rmdirSync(lock); } catch { /* lock cleanup is best-effort */ } logger.info({ event: 'sync_complete', durationMs: Date.now()-started, ...stats }); }
}
